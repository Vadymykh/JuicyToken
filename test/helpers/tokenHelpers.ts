import { JuicyToken } from "../../typechain-types";
import { toBig } from "./bigNumberHelpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { expect } from "chai";

export async function transferToWallet(
  Token: JuicyToken,
  from: HardhatEthersSigner,
  to: HardhatEthersSigner,
  amount: number,
) {
  const bAmount = toBig(amount);

  await Token.connect(from).transfer(to.address, bAmount);

  expect(await getWalletBalancesSum(Token)).eq(await Token.walletBalancesSum());
}

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