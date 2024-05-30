import { ethers } from "hardhat";
import { expect } from 'chai';
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

import { JuicyToken as JuicyTokenContract } from "../typechain-types";
import { toBig, toNum } from "./helpers/bigNumberHelpers";
import { transferToWallet } from "./helpers/tokenHelpers";

const provider = ethers.provider;

let signers: HardhatEthersSigner[];
let [owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8, addr9]: HardhatEthersSigner[] = [];
let JuicyToken: JuicyTokenContract;

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
        addr5,
        addr6,
        addr7,
        addr8,
        addr9
      ] = await ethers.getSigners();
      signers = [owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8, addr9];
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
    });

  });
  describe('Transfers', () => {

    it('should time pass', async () => {
      await mine(SECONDS_IN_YEAR / BLOCK_DURATION + 1, { interval: BLOCK_DURATION });
    });

    it('should user transfer tokens', async () => {
      console.log({
        totalSupply: toNum(await JuicyToken.totalSupply()),
        distributedRewards: toNum(await JuicyToken.distributedRewards()),
        totalWalletsBalance: toNum(await JuicyToken.walletBalancesSum()),
        owner: toNum(await JuicyToken.balanceOf(owner.address)),
        addr1: toNum(await JuicyToken.balanceOf(addr1.address)),
      });

      await transferToWallet(JuicyToken, owner, addr1, 1000);

      console.log({
        totalSupply: toNum(await JuicyToken.totalSupply()),
        distributedRewards: toNum(await JuicyToken.distributedRewards()),
        totalWalletsBalance: toNum(await JuicyToken.walletBalancesSum()),
        owner: toNum(await JuicyToken.balanceOf(owner.address)),
        addr1: toNum(await JuicyToken.balanceOf(addr1.address)),
      });

      expect(await JuicyToken.balanceOf(owner.address))
        .closeTo(toBig(1_499_000), toBig(0.001));
    });

  });
});
