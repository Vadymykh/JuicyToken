import { JuicyToken } from "../../typechain-types";
import { toBig } from "./bigNumberHelpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";

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
  amount: number,
) {
  const bAmount = toBig(amount);

  const {
    pendingFrom,
    pendingTo,
    balanceFrom1,
    balanceTo1,
    balanceFrom2,
    balanceTo2,
  } = await _collectTransferDataAndCheck(Token, from, to, bAmount);

  if (balanceFrom1 !== 0n) expect(pendingFrom).gt(balanceFrom1);
  if (balanceTo1 !== 0n) expect(pendingTo).gt(balanceTo1);

  expect(pendingFrom - bAmount).closeTo(balanceFrom2, balanceFrom2 / 1000n);
  expect(pendingTo + bAmount).closeTo(balanceTo2, balanceFrom2 / 1000n);
}

/**
 * Collects variables and makes common checks
 * @param Token JuicyToken contract
 * @param from From account
 * @param to To account
 * @param bAmount Amount to transfer
 */
async function _collectTransferDataAndCheck(
  Token: JuicyToken,
  from: HardhatEthersSigner,
  to: HardhatEthersSigner,
  bAmount: bigint,
) {
  const pendingFrom = await Token.pendingBalanceOf(from.address);
  const pendingTo = await Token.pendingBalanceOf(to.address);

  const balanceFrom1 = await Token.balanceOf(from.address);
  const balanceTo1 = await Token.balanceOf(to.address);

  await Token.connect(from).transfer(to.address, bAmount);

  const balanceFrom2 = await Token.balanceOf(from.address);
  const balanceTo2 = await Token.balanceOf(to.address);

  expect(await getWalletBalancesSum(Token)).eq(await Token.walletBalancesSum());

  return {
    pendingFrom, pendingTo, balanceFrom1, balanceTo1, balanceFrom2, balanceTo2,
  };
}

/**
 * Collects sum of wallet balances
 * @param Token JuicyToken contract
 */
export async function getWalletBalancesSum(
  Token: JuicyToken
) {
  const signers = await ethers.getSigners();

  let sum = 0n;

  for (let i = 0; i < 10; i++) {
    sum += await Token.balanceOf(signers[i].address);
  }

  return sum;
}