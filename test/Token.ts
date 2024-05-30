import { ethers } from "hardhat";
import { expect } from 'chai';
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import { JuicyToken as JuicyTokenContract, TransferContract } from "../typechain-types";
import { toBig } from "./helpers/bigNumberHelpers";
import {
  transferContractToContract,
  transferContractToWallet,
  transferWalletToContract,
  transferWalletToWallet
} from "./helpers/tokenHelpers";

let [owner, addr1, addr2, addr3, addr4]: HardhatEthersSigner[] = [];
let JuicyToken: JuicyTokenContract;
let [TransferMock1, TransferMock2]: TransferContract[] = [];

const INITIAL_SUPPLY = toBig(1000_000);
const MAXIMUM_TOTAL_SUPPLY = toBig(5000_000);
const INITIAL_MULTIPLIER = 15_000; // 150% = x1.5 per year

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
const BLOCK_DURATION = 3; // 3 seconds

describe('Juicy Token', () => {
  describe('Initiation', () => {

    it("Defining Generals", async function () {
      [
        owner,
        addr1,
        addr2,
        addr3,
        addr4,
      ] = await ethers.getSigners();
    });

    it('should deploy contract', async () => {
      JuicyToken = await (await ethers.getContractFactory("JuicyToken"))
        .deploy(
          INITIAL_SUPPLY,
          MAXIMUM_TOTAL_SUPPLY,
          INITIAL_MULTIPLIER,
        );
      await JuicyToken.waitForDeployment();

      expect(await JuicyToken.INITIAL_SUPPLY()).eq(INITIAL_SUPPLY);
      expect(await JuicyToken.MAXIMUM_TOTAL_SUPPLY()).eq(MAXIMUM_TOTAL_SUPPLY);
      expect(await JuicyToken.INITIAL_MULTIPLIER()).eq(INITIAL_MULTIPLIER);
      expect(await JuicyToken.balanceOf(owner.address)).eq(INITIAL_SUPPLY);

      expect(await JuicyToken.totalSupply()).eq(INITIAL_SUPPLY);
      expect(await JuicyToken.walletBalancesSum()).eq(INITIAL_SUPPLY);
      expect(await JuicyToken.getCurrentMultiplier()).eq(INITIAL_MULTIPLIER);

      console.log(`Current multiplier is x${Number(await JuicyToken.getCurrentMultiplier()) / 1e4}`);
    });

    it('should deploy test contracts', async () => {
      TransferMock1 = await (await ethers.getContractFactory("TransferContract"))
        .deploy(JuicyToken.target);
      await TransferMock1.waitForDeployment();
      TransferMock2 = await (await ethers.getContractFactory("TransferContract"))
        .deploy(JuicyToken.target);
      await TransferMock2.waitForDeployment();
    });

  });
  describe('Transfers', () => {

    it('should time pass', async () => {
      await mine(SECONDS_IN_YEAR / BLOCK_DURATION + 1, { interval: BLOCK_DURATION });
    });

    it('should user transfer tokens wallet-to-wallet', async () => {
      await transferWalletToWallet(JuicyToken, owner, addr1, 1000);

      expect(await JuicyToken.totalSupply())
        .closeTo(toBig(1_500_000), toBig(1000));
      expect(await JuicyToken.getCurrentMultiplier())
        .closeTo(14375, 2);
      expect(await JuicyToken.balanceOf(owner.address))
        .closeTo(toBig(1_499_000), toBig(1000));
      expect(await JuicyToken.balanceOf(addr1.address))
        .eq(toBig(1000));
    });

    it('should time pass', async () => {
      await mine(SECONDS_IN_YEAR / BLOCK_DURATION + 1, { interval: BLOCK_DURATION });
    });

    it('should user transfer tokens from wallet to contract', async () => {
      await transferWalletToContract(JuicyToken, owner, TransferMock1, 10000);

      expect(await JuicyToken.balanceOf(TransferMock1.target))
        .eq(toBig(10000));
    });

    it('should time pass', async () => {
      await mine(1200, { interval: BLOCK_DURATION });
    });

    it('should user transfer tokens from contract to wallet', async () => {
      await transferContractToWallet(JuicyToken, TransferMock1, addr1, 1000);

      expect(await JuicyToken.balanceOf(TransferMock1.target))
        .eq(toBig(9000));
    });

    it('should user transfer tokens from contract to wallet', async () => {
      await transferContractToWallet(JuicyToken, TransferMock1, addr2, 1000);

      expect(await JuicyToken.balanceOf(TransferMock1.target))
        .eq(toBig(8000));
      expect(await JuicyToken.balanceOf(addr2.address))
        .eq(toBig(1000));
    });

    it('should user transfer tokens from wallet to contract', async () => {
      await transferWalletToContract(JuicyToken, owner, TransferMock1, 2_100_000);

      expect(await JuicyToken.balanceOf(TransferMock1.target))
        .eq(toBig(2_108_000));
    });

    it('should user transfer tokens from contract to contract', async () => {
      await transferContractToContract(JuicyToken, TransferMock1, TransferMock2, 100_000);
      console.log(`Current multiplier is x${Number(await JuicyToken.getCurrentMultiplier()) / 1e4}`);

      expect(await JuicyToken.balanceOf(TransferMock1.target))
        .eq(toBig(2_008_000));
      expect(await JuicyToken.balanceOf(TransferMock2.target))
        .eq(toBig(100_000));
    });

    it('should user transfer tokens from contract to wallet', async () => {
      await transferContractToWallet(JuicyToken, TransferMock1, addr3, 2000_000);

      expect(await JuicyToken.balanceOf(TransferMock1.target))
        .eq(toBig(8_000));
      expect(await JuicyToken.balanceOf(addr3.address))
        .eq(toBig(2000_000));
    });

    it('should time pass', async () => {
      await mine(SECONDS_IN_YEAR * 2, { interval: BLOCK_DURATION });
    });

    it('should user transfer tokens wallet-to-wallet and current multiplier becomes x1', async () => {
      await transferWalletToWallet(JuicyToken, addr3, addr1, 1000);
      console.log(`Current multiplier is x${Number(await JuicyToken.getCurrentMultiplier()) / 1e4}`);
      // in reality it would take much longer, because multiplier would decrease in smaller steps over time

      expect(await JuicyToken.getCurrentMultiplier()).eq(10_000);
    });

    it('should users transfer tokens wallet-to-wallet', async () => {
      await transferWalletToWallet(JuicyToken, addr3, addr4, 10);
      await transferWalletToWallet(JuicyToken, addr1, addr2, 50);
      await transferWalletToWallet(JuicyToken, addr1, owner, 50);

      expect(await JuicyToken.totalSupply()).closeTo(MAXIMUM_TOTAL_SUPPLY, toBig(1));
      expect(await JuicyToken.pendingRewards()).closeTo(0, toBig(1));
    });

  });
});
