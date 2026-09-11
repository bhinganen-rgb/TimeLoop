const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TimeLoop", function () {
  let TimeLoop, c, owner, alice, bob;
  const FEE = ethers.parseEther("0.002");

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    TimeLoop = await ethers.getContractFactory("TimeLoop");
    c = await TimeLoop.deploy();
    await c.waitForDeployment();
  });

  async function currentWeek() {
    return Number(await c.getCurrentWeek());
  }

  it("reserves a slot with correct fee", async () => {
    const wk = await currentWeek();
    await expect(c.connect(alice).reserveSlot(720, wk + 1, "hello", { value: FEE }))
      .to.emit(c, "SlotReserved");
    expect(await c.reservationCount()).to.equal(1n);
  });

  it("rejects reservation without fee", async () => {
    const wk = await currentWeek();
    await expect(c.connect(alice).reserveSlot(720, wk + 1, "hi", { value: 0 }))
      .to.be.revertedWith("fee");
  });

  it("rejects invalid slot index >= 1440", async () => {
    const wk = await currentWeek();
    await expect(c.connect(alice).reserveSlot(1440, wk + 1, "hi", { value: FEE }))
      .to.be.revertedWith("slot");
  });

  it("rejects past week", async () => {
    const wk = await currentWeek();
    await expect(c.connect(alice).reserveSlot(0, wk - 1, "hi", { value: FEE }))
      .to.be.revertedWith("week past");
  });

  it("rejects double reservation of same slot in week", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(100, wk + 1, "a", { value: FEE });
    await expect(c.connect(bob).reserveSlot(100, wk + 1, "b", { value: FEE }))
      .to.be.revertedWith("taken");
  });

  it("owner can updateMessage; non-owner cannot", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(200, wk + 1, "old", { value: FEE });
    await c.connect(alice).updateMessage(1, "new");
    const r = await c.getReservation(1);
    expect(r[3]).to.equal("new");
    await expect(c.connect(bob).updateMessage(1, "hack")).to.be.revertedWith("not owner");
  });

  it("cancelReservation refunds fee minus cancel fee", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(300, wk + 2, "x", { value: FEE });
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await c.connect(alice).cancelReservation(1);
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);
    const cancelCost = (FEE * 100n) / 10000n;
    const refund = FEE - cancelCost;
    expect(after - before + gas).to.equal(refund);
  });

  it("cancelReservation rejected once week started", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(400, wk, "now", { value: FEE });
    await expect(c.connect(alice).cancelReservation(1)).to.be.revertedWith("week started");
  });

  it("cancel non-owner rejected", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(500, wk + 1, "x", { value: FEE });
    await expect(c.connect(bob).cancelReservation(1)).to.be.revertedWith("not owner");
  });

  it("getReservationForSlot returns 0 when unreserved", async () => {
    const wk = await currentWeek();
    expect(await c.getReservationForSlot(999, wk)).to.equal(0n);
  });

  it("getCurrentSlot within 0..1439", async () => {
    const s = Number(await c.getCurrentSlot());
    expect(s).to.be.gte(0);
    expect(s).to.be.lt(1440);
  });

  it("pause blocks reserveSlot", async () => {
    await c.pause();
    const wk = await currentWeek();
    await expect(c.connect(alice).reserveSlot(0, wk + 1, "x", { value: FEE }))
      .to.be.revertedWithCustomError(c, "EnforcedPause");
  });

  it("admin bounds enforced", async () => {
    await expect(c.setSlotFee(ethers.parseEther("2"))).to.be.revertedWith("max fee");
    await expect(c.setCancelFeeBps(2500)).to.be.revertedWith("max bps");
    await c.setSlotFee(ethers.parseEther("0.5"));
    await c.setCancelFeeBps(500);
    expect(await c.slotFee()).to.equal(ethers.parseEther("0.5"));
  });

  it("getReservationsByOwner tracks ids", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(1, wk + 1, "a", { value: FEE });
    await c.connect(alice).reserveSlot(2, wk + 1, "b", { value: FEE });
    const ids = await c.getReservationsByOwner(alice.address);
    expect(ids.length).to.equal(2);
  });

  it("withdrawFees transfers balance to owner", async () => {
    const wk = await currentWeek();
    await c.connect(alice).reserveSlot(700, wk + 1, "x", { value: FEE });
    const before = await ethers.provider.getBalance(bob.address);
    await c.withdrawFees(bob.address);
    const after = await ethers.provider.getBalance(bob.address);
    expect(after - before).to.equal(FEE);
  });
});
