import chai, { expect } from 'chai';
import { Contract } from 'ethers';
import { solidity } from 'ethereum-waffle';
import { expandTo18Decimals } from './shared/utilities';
import { deployStablePoolFactory, deployTestERC20, deployVault, deployWETH9 } from './shared/fixtures';
import { Artifact, HardhatRuntimeEnvironment } from 'hardhat/types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const hre: HardhatRuntimeEnvironment = require('hardhat');
const ethers = require("hardhat").ethers;
chai.use(solidity);

describe('StablePoolFactory', () => {
  let wallets: SignerWithAddress[];
  let testTokens: [string, string];

  before(async () => {
    wallets = await ethers.getSigners();

    const tokenA = await deployTestERC20(expandTo18Decimals(10000));
    const tokenB = await deployTestERC20(expandTo18Decimals(10000));
    testTokens = [tokenA.address, tokenB.address];
  });

  let weth: Contract;
  let vault: Contract;
  let factory: Contract;

  beforeEach(async () => {
    weth = await deployWETH9();
    vault = await deployVault(weth.address);
    factory = await deployStablePoolFactory(vault.address, wallets[1].address);
  });

  /*
  it('INIT_CODE_PAIR_HASH', async () => {
    expect(await factory.INIT_CODE_PAIR_HASH()).to.eq('0x0a44d25bd998b8cce3bec356e00044787b55feabe1b89cb62eba44ef25855128')
  })
  */

  it('Should return default values', async () => {
    expect(await factory.feeRecipient()).to.eq(wallets[1].address);
    expect(await factory.owner()).to.eq(wallets[0].address);
    expect(await factory.poolsLength()).to.eq(0);
    expect(await factory.protocolFee()).to.eq(50000);
    expect(await factory.defaultSwapFee()).to.eq(100);
  });

  async function createStablePool(tokenA: string, tokenB: string) {
    const [token0, token1]: [string, string] = (
      Number(tokenA) < Number(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
    );

    await expect(factory.createPool(tokenA, tokenB))
      .to.emit(factory, 'PoolCreated');

    await expect(factory.createPool(tokenA, tokenB)).to.be.revertedWith('PoolExists()');
    await expect(factory.createPool(tokenB, tokenA)).to.be.revertedWith('PoolExists()');

    const poolAddress = await factory.getPool(tokenA, tokenB);
    expect(await factory.getPool(tokenB, tokenA)).to.eq(poolAddress);
    expect(await factory.isPool(poolAddress)).to.eq(true);
    expect(await factory.pools(0)).to.eq(poolAddress);
    expect(await factory.poolsLength()).to.eq(1);

    const poolArtifact: Artifact = await hre.artifacts.readArtifact('StablePool');
    const pool = new Contract(poolAddress, poolArtifact.abi, ethers.provider);
    expect(await pool.poolType()).to.eq(2);
    expect(await pool.factory()).to.eq(factory.address);
    expect(await pool.token0()).to.eq(token0);
    expect(await pool.token1()).to.eq(token1);
  };

  it('Should create a stable pool', async () => {
    await createStablePool(testTokens[0], testTokens[1]);
  });

  it('Should create a stable pool in reverse tokens', async () => {
    await createStablePool(testTokens[1], testTokens[0]);
  });

  it('Should use expected gas on creating stable pool', async () => {
    const tx = await factory.createPool(testTokens[0], testTokens[1]);
    const receipt = await tx.wait();
    expect(receipt.gasUsed).to.eq(2531043); // 2512920 for Uniswap V2
  });

  it('Should set a new fee recipient', async () => {
    // Set fee recipient using a wrong account.
    await expect(factory.connect(wallets[1]).setFeeRecipient(wallets[1].address)).to.be.reverted;

    // Set a new fee recipient.
    await factory.setFeeRecipient(wallets[0].address);

    // Expect new fee recipient.
    expect(await factory.feeRecipient()).to.eq(wallets[0].address);
  });

  it('Should set a new protocol fee', async () => {
    // Expect current protocol fee.
    expect(await factory.protocolFee()).to.eq(50000);

    // Set protocol fee using wrong account.
    await expect(factory.connect(wallets[1]).setProtocolFee(30000)).to.be.reverted;

    // Set a new protocol fee.
    await factory.setProtocolFee(30000);

    // Expect new protocol fee.
    expect(await factory.protocolFee()).to.eq(30000);
  });
});