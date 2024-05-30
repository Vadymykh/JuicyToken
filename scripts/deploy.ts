import { ethers } from "hardhat";
import hre = require("hardhat");
import { toBig } from "../test/helpers/bigNumberHelpers";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

const INITIAL_SUPPLY = toBig(1000_000);
const MAXIMUM_TOTAL_SUPPLY = toBig(5000_000);
let INITIAL_MULTIPLIER = 15_000; // 150% = x1.5 per year

async function main() {
  if (hre.network.name === 'bscTestnet') {
    INITIAL_MULTIPLIER = 30_000; // 300% = x3 per year
  }

  console.log('Deploying JuicyToken contract');
  const JuicyToken = await (await ethers.getContractFactory("JuicyToken"))
    .deploy(
      INITIAL_SUPPLY,
      MAXIMUM_TOTAL_SUPPLY,
      INITIAL_MULTIPLIER,
    );
  await JuicyToken.waitForDeployment();
  console.log(`JuicyToken deployed to: ${JuicyToken.target}`);


  /******************************************** VERIFICATION ********************************************/
  /******************************************** VERIFICATION ********************************************/

  console.log("We verify now, Please wait!");
  await delay(45000);

  console.log("Verifying JuicyToken");
  try {
    await hre.run("verify:verify", {
      address: JuicyToken.target,
      constructorArguments: [
        INITIAL_SUPPLY,
        MAXIMUM_TOTAL_SUPPLY,
        INITIAL_MULTIPLIER,
      ],
    });
  } catch (e) {
    console.log(e);
  }

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
