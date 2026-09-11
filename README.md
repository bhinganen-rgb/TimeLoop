# TimeLoop

Reserve a specific UTC minute of the day for a week on BOT Chain. Your message displays only during that minute.

## Concept

1440 minute-slots per day (0-1439). Reserve a `(slotIdx, weekIdx)` pair — for that week, every day at your minute, your message becomes the "current signal."

- `week = block.timestamp / 604800`
- `slot = (block.timestamp % 86400) / 60`

## Setup

```bash
npm install
cp .env.example .env   # add your PRIVATE_KEY
npx hardhat compile
npx hardhat test
```

## Deploy

```bash
npm run deploy:testnet   # BOT Chain Testnet (chainId 968)
npm run deploy:mainnet   # BOT Chain Mainnet (chainId 677)
```

Copy the deployed address into `CONTRACT_ADDRESS` in `frontend/index.html`.

## Frontend

Single-file HTML. Serve `frontend/index.html` (Vercel config included).

## Contract API

- `reserveSlot(slotIdx, weekIdx, message)` payable — fee 0.002 BOT default
- `updateMessage(id, newMessage)` — owner, before expiry
- `cancelReservation(id)` — owner, only before week starts, refunds fee minus cancel bps
- `getMessageForNow()` — the signal for the current UTC minute
- Admin: `pause / unpause / setSlotFee / setCancelFeeBps / withdrawFees`

## Networks

| Network | Chain ID | RPC |
|---|---|---|
| Testnet | 968 (0x3C8) | https://rpc.bohr.life |
| Mainnet | 677 (0x2A5) | https://rpc.botchain.ai |
