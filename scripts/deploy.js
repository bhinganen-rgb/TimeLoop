const hre = require("hardhat");

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const bal = await hre.ethers.provider.getBalance(signer.address);
  console.log("Network:", hre.network.name);
  console.log("Deployer:", signer.address);
  console.log("Balance :", hre.ethers.formatEther(bal), "BOT");

  const TimeLoop = await hre.ethers.getContractFactory("TimeLoop");
  const c = await TimeLoop.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();

  console.log("\nTimeLoop deployed at:", addr);
  console.log("\n>>> Update CONTRACT_ADDRESS in frontend/index.html with:", addr);
}

main().catch((e) => { console.error(e); process.exit(1); });
