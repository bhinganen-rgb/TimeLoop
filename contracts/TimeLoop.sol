// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title TimeLoop — reserve a UTC minute of the day for a week
contract TimeLoop is Ownable, ReentrancyGuard, Pausable {
    enum Status { Active, Expired, Cancelled }

    struct Reservation {
        address owner;
        uint16 slotIdx;    // 0-1439
        uint16 weekIdx;    // weeks since unix epoch
        string message;
        uint256 reservedAt;
        Status status;
    }

    uint256 public slotFee = 0.002 ether;
    uint256 public cancelFeeBps = 100; // 1%
    uint256 public constant MAX_SLOT_FEE = 1 ether;
    uint256 public constant MAX_CANCEL_FEE_BPS = 2000; // 20%
    uint256 public constant MESSAGE_MAX = 280;

    uint256 private _nextId = 1;
    mapping(uint256 => Reservation) private _reservations;
    mapping(uint256 => mapping(uint16 => uint256)) public slotOf; // week => slot => reservationId
    mapping(address => uint256[]) private _ownerReservations;

    event SlotReserved(uint256 indexed id, address indexed owner, uint16 slotIdx, uint16 weekIdx, uint256 fee);
    event MessageUpdated(uint256 indexed id, address indexed owner);
    event ReservationCancelled(uint256 indexed id, address indexed owner, uint256 refund);

    constructor() Ownable(msg.sender) {}

    function reserveSlot(uint16 slotIdx, uint16 weekIdx, string calldata message)
        external payable nonReentrant whenNotPaused returns (uint256)
    {
        require(msg.value >= slotFee, "fee");
        require(slotIdx < 1440, "slot");
        require(weekIdx >= getCurrentWeek(), "week past");
        require(bytes(message).length > 0 && bytes(message).length <= MESSAGE_MAX, "msg len");
        require(slotOf[weekIdx][slotIdx] == 0, "taken");

        uint256 id = _nextId++;
        _reservations[id] = Reservation({
            owner: msg.sender,
            slotIdx: slotIdx,
            weekIdx: weekIdx,
            message: message,
            reservedAt: block.timestamp,
            status: Status.Active
        });
        slotOf[weekIdx][slotIdx] = id;
        _ownerReservations[msg.sender].push(id);

        emit SlotReserved(id, msg.sender, slotIdx, weekIdx, msg.value);
        return id;
    }

    function updateMessage(uint256 id, string calldata newMessage) external whenNotPaused {
        Reservation storage r = _reservations[id];
        require(r.owner == msg.sender, "not owner");
        require(r.status == Status.Active, "inactive");
        require(bytes(newMessage).length > 0 && bytes(newMessage).length <= MESSAGE_MAX, "msg len");
        // allow updates during the week
        require(r.weekIdx >= getCurrentWeek(), "expired");
        r.message = newMessage;
        emit MessageUpdated(id, msg.sender);
    }

    function cancelReservation(uint256 id) external nonReentrant {
        Reservation storage r = _reservations[id];
        require(r.owner == msg.sender, "not owner");
        require(r.status == Status.Active, "inactive");
        require(r.weekIdx > getCurrentWeek(), "week started");

        r.status = Status.Cancelled;
        slotOf[r.weekIdx][r.slotIdx] = 0;

        uint256 cancelCost = (slotFee * cancelFeeBps) / 10000;
        uint256 refund = slotFee - cancelCost;
        (bool ok, ) = msg.sender.call{value: refund}("");
        require(ok, "refund fail");

        emit ReservationCancelled(id, msg.sender, refund);
    }

    function getReservation(uint256 id) external view returns (
        address owner, uint16 slotIdx, uint16 weekIdx,
        string memory message, uint256 reservedAt, uint8 status
    ) {
        Reservation storage r = _reservations[id];
        return (r.owner, r.slotIdx, r.weekIdx, r.message, r.reservedAt, uint8(r.status));
    }

    function getCurrentSlot() public view returns (uint16) {
        return uint16((block.timestamp % 86400) / 60);
    }

    function getCurrentWeek() public view returns (uint16) {
        return uint16(block.timestamp / 604800);
    }

    function getReservationForSlot(uint16 slotIdx, uint16 weekIdx) external view returns (uint256) {
        return slotOf[weekIdx][slotIdx];
    }

    function getMessageForNow() external view returns (string memory message, address owner, bool exists) {
        uint256 id = slotOf[getCurrentWeek()][getCurrentSlot()];
        if (id == 0) return ("", address(0), false);
        Reservation storage r = _reservations[id];
        if (r.status != Status.Active) return ("", address(0), false);
        return (r.message, r.owner, true);
    }

    function getReservationsByOwner(address who) external view returns (uint256[] memory) {
        return _ownerReservations[who];
    }

    function reservationCount() external view returns (uint256) {
        return _nextId - 1;
    }

    // Admin
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function setSlotFee(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_SLOT_FEE, "max fee");
        slotFee = newFee;
    }

    function setCancelFeeBps(uint256 bps) external onlyOwner {
        require(bps <= MAX_CANCEL_FEE_BPS, "max bps");
        cancelFeeBps = bps;
    }

    function withdrawFees(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "to");
        uint256 bal = address(this).balance;
        (bool ok, ) = to.call{value: bal}("");
        require(ok, "withdraw fail");
    }

    receive() external payable {}
}
