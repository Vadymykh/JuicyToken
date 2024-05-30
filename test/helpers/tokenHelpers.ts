import { JuicyToken, TransferContract } from "../../typechain-types";
import { toBig } from "./bigNumberHelpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BaseContract } from "ethers";

/**
 * Executes and checks wallet-to-wallet transfer
 * @param Token JuicyToken contract
 * @param from From account
 * @param to To account
 * @param amount Amount to transfer
 */
export async function transferWalletToWallet(
  Token: JuicyToken,
  from: HardhatEthersSigner,
  to: HardhatEthersSigner,
  amount: number
) {
  const bAmount = toBig(amount);

  const {
    pendingFrom,
    pendingTo,
    balanceFrom1,
    balanceTo1,
    balanceFrom2,
    balanceTo2,
    currentMultiplier1,
    currentMultiplier2,
  } = await _collectTransferDataAndCheck(
    Token,
    async () => {
      await Token.connect(from).transfer(to.address, bAmount);
    },
    from.address,
    to.address
  );

  if (balanceFrom1 !== 0n) expect(pendingFrom).gte(balanceFrom1);
  if (balanceTo1 !== 0n) expect(pendingTo).gte(balanceTo1);

  expect(pendingFrom - bAmount).closeTo(balanceFrom2, balanceFrom2 / 1000n);
  expect(pendingTo + bAmount).closeTo(balanceTo2, balanceFrom2 / 1000n);

  expect(currentMultiplier1).gte(currentMultiplier2);
}

/**
 * Executes and checks wallet-to-contract transfer
 * @param Token JuicyToken contract
 * @param from From account
 * @param to Receiver smart contract
 * @param amount Amount to transfer
 */
export async function transferWalletToContract(
  Token: JuicyToken,
  from: HardhatEthersSigner,
  to: BaseContract,
  amount: number
) {
  const bAmount = toBig(amount);

  const {
    pendingFrom,
    pendingTo,
    balanceFrom1,
    balanceTo1,
    balanceFrom2,
    balanceTo2,
    currentMultiplier1,
    currentMultiplier2,
  } = await _collectTransferDataAndCheck(
    Token,
    async () => {
      await Token.connect(from).transfer(to.target, bAmount);
    },
    from.address,
    to.target.toString()
  );

  if (balanceFrom1 !== 0n) expect(pendingFrom).gt(balanceFrom1);
  expect(pendingTo).eq(balanceTo1);

  expect(pendingFrom - bAmount).closeTo(balanceFrom2, balanceFrom2 / 1000n);
  expect(balanceTo1 + bAmount).eq(balanceTo2);

  expect(currentMultiplier1).gte(currentMultiplier2);
}

/**
 * Executes and checks contract-to-wallet transfer
 * @param Token JuicyToken contract
 * @param from Sender smart contract
 * @param to Receiver wallet
 * @param amount Amount to transfer
 */
export async function transferContractToWallet(
  Token: JuicyToken,
  from: TransferContract,
  to: HardhatEthersSigner,
  amount: number
) {
  const signer = (await ethers.getSigners())[0];

  const bAmount = toBig(amount);

  const {
    pendingFrom,
    pendingTo,
    balanceFrom1,
    balanceTo1,
    balanceFrom2,
    balanceTo2,
    currentMultiplier1,
    currentMultiplier2,
  } = await _collectTransferDataAndCheck(
    Token,
    async () => {
      await from.connect(signer).transferToken(to.address, bAmount);
    },
    from.target.toString(),
    to.address
  );

  expect(pendingFrom).eq(balanceFrom1);
  if (balanceTo1 !== 0n) expect(pendingTo).gt(balanceTo1);

  expect(balanceFrom1 - bAmount).eq(balanceFrom2);
  expect(pendingTo + bAmount).closeTo(balanceTo2, balanceTo2 / 1000n);

  expect(currentMultiplier1).gte(currentMultiplier2);
}

/**
 * Executes and checks contract-to-contract transfer
 * @param Token JuicyToken contract
 * @param from Sender smart contract
 * @param to Receiver smart contract
 * @param amount Amount to transfer
 */
export async function transferContractToContract(
  Token: JuicyToken,
  from: TransferContract,
  to: TransferContract,
  amount: number
) {
  const signer = (await ethers.getSigners())[0];

  const bAmount = toBig(amount);

  const totalSupply1 = await Token.totalSupply();
  const walletBalancesSum1 = await Token.walletBalancesSum();

  const {
    pendingFrom,
    pendingTo,
    balanceFrom1,
    balanceTo1,
    balanceFrom2,
    balanceTo2,
    currentMultiplier1,
    currentMultiplier2,
  } = await _collectTransferDataAndCheck(
    Token,
    async () => {
      await from.connect(signer).transferToken(to.target, bAmount);
    },
    from.target.toString(),
    to.target.toString()
  );

  const totalSupply2 = await Token.totalSupply();
  const walletBalancesSum2 = await Token.walletBalancesSum();

  expect(pendingFrom).eq(balanceFrom1);
  expect(pendingTo).eq(balanceTo1);

  expect(balanceFrom1 - bAmount).eq(balanceFrom2);
  expect(balanceTo1 + bAmount).eq(balanceTo2);

  expect(currentMultiplier1).eq(currentMultiplier2);
  expect(totalSupply1).eq(totalSupply2);
  expect(walletBalancesSum1).eq(walletBalancesSum2);
}

/**
 * Collects variables and makes common checks
 * @param Token JuicyToken contract
 * @param callback
 * @param from From account
 * @param to To account
 */
async function _collectTransferDataAndCheck(
  Token: JuicyToken,
  callback: () => Promise<void>,
  from: string,
  to: string
) {
  const pendingFrom = await Token.pendingBalanceOf(from);
  const pendingTo = await Token.pendingBalanceOf(to);

  const balanceFrom1 = await Token.balanceOf(from);
  const balanceTo1 = await Token.balanceOf(to);
  const currentMultiplier1 = await Token.getCurrentMultiplier();

  await callback();

  const balanceFrom2 = await Token.balanceOf(from);
  const balanceTo2 = await Token.balanceOf(to);
  const currentMultiplier2 = await Token.getCurrentMultiplier();

  expect(await getWalletBalancesSum(Token)).eq(await Token.walletBalancesSum());
  expect(currentMultiplier2).gte(10_000);

  return {
    pendingFrom,
    pendingTo,
    balanceFrom1,
    balanceTo1,
    balanceFrom2,
    balanceTo2,
    currentMultiplier1,
    currentMultiplier2,
  };
}

/**
 * Collects sum of wallet balances
 * @param Token JuicyToken contract
 */
export async function getWalletBalancesSum(Token: JuicyToken) {
  const signers = await ethers.getSigners();

  let sum = 0n;

  for (let i = 0; i < 10; i++) {
    sum += await Token.balanceOf(signers[i].address);
  }

  return sum;
}
