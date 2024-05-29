import {ethers} from "hardhat";
import {expect} from 'chai';
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

import {
  JuicyToken as JuicyTokenContract,
} from "../typechain-types";
import {toBig} from "./helpers/bigNumberHelpers";

// const helpers = require("@nomicfoundation/hardhat-network-helpers");

const provider = ethers.provider;

let signers: HardhatEthersSigner[];
let [owner, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8, addr9]: HardhatEthersSigner[] = [];
let JuicyToken: JuicyTokenContract;

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
      .deploy(toBig(1000_000));
    await JuicyToken.waitForDeployment();
  });

  it('Test', async () => {

  });

});
