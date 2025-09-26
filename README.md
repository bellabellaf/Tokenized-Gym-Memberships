# 🏋️‍♂️ Tokenized Gym Memberships

Welcome to a decentralized solution for gym memberships! This project uses the Stacks blockchain and Clarity smart contracts to create tokenized gym memberships that are transferable across participating gym locations, providing flexibility and interoperability for fitness enthusiasts.

## ✨ Features

🔑 **Tokenized Memberships**: Non-fungible tokens (NFTs) represent unique gym memberships.  
🔄 **Transferability**: Members can transfer or trade memberships across participating gyms.  
🏢 **Multi-Location Access**: Use a single membership to access any partnered gym.  
📜 **Immutable Records**: Track membership ownership, usage, and transfers on-chain.  
✅ **Verification**: Gyms can verify membership validity in real-time.  
💸 **Payment Splits**: Automatically distribute membership fees to gym operators.  
🛡️ **Access Control**: Restrict gym access to active, valid membership holders.

## 🛠 How It Works

### For Members
1. **Purchase a Membership**: Mint a membership NFT by paying the required fee.
2. **Access Gyms**: Present your membership NFT (via a wallet QR code) to gain entry at any participating gym.
3. **Transfer Membership**: Transfer your membership NFT to another user or trade it on a marketplace.
4. **Check Status**: View membership details, such as validity period and usage history.

### For Gym Operators
1. **Register Gym**: Add your gym to the network by registering it on the blockchain.
2. **Verify Access**: Scan a member’s NFT to confirm their membership status and grant access.
3. **Receive Payments**: Automatically receive a share of membership fees based on usage at your location.

### For Verifiers
- Use the `membership-details` function to check ownership and validity.
- Call `verify-membership` to confirm a user’s access rights at a gym.

## 📂 Smart Contracts (6 Contracts)

1. **MembershipNFT**: Manages the minting, transfer, and ownership of membership NFTs.
2. **GymRegistry**: Registers and manages participating gyms in the network.
3. **AccessControl**: Verifies membership validity and grants access to gym facilities.
4. **PaymentSplitter**: Distributes membership fees among gym operators based on usage.
5. **MembershipManager**: Tracks membership details, such as validity period and usage history.
6. **TransferMarketplace**: Facilitates secure transfer and trading of membership NFTs.
