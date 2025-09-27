# 🧬 Blockchain-based Genomic Data Marketplace

Welcome to a revolutionary platform that empowers individuals to securely and anonymously share their genomic data (DNA sequences) for scientific research, while earning royalties through NFTs. Built on the Stacks blockchain using Clarity smart contracts, this marketplace addresses real-world challenges like data privacy breaches, lack of compensation for personal data contributions, and barriers to accessible genomic research datasets.

## ✨ Features

🔒 Anonymous data sharing with encryption and hashing for privacy  
📤 Secure upload of genomic sequences without revealing personal info  
💰 Royalty payments via NFTs for every data access or usage  
🛒 Marketplace for researchers to browse and purchase data access  
🔍 Verifiable data integrity and ownership proofs  
📈 Automated royalty distribution on secondary NFT sales  
🚫 Dispute resolution for invalid data claims  
🌐 Governance for community-driven platform updates  

## 🛠 How It Works

**For Data Owners (Individuals)**  
- Encrypt and hash your DNA sequence locally (e.g., using SHA-256 for hashing).  
- Register anonymously and mint an NFT representing ownership of your data.  
- Upload the hashed data to the blockchain via the DataStorage contract.  
- List your data on the marketplace with access terms (e.g., one-time fee or ongoing royalties).  
- Earn automatic royalties whenever researchers access or use your data, distributed via the RoyaltyDistributor contract.  

**For Researchers**  
- Browse available genomic datasets on the marketplace.  
- Purchase access rights by buying or licensing the associated NFT.  
- Verify data integrity using the DataVerifier contract.  
- Access decrypted snippets or full data through secure, permissioned calls.  
- Pay royalties for extended usage, ensuring fair compensation to owners.  

**Overall System Flow**  
Data is never stored in plain text on-chain—only hashes and metadata. Off-chain storage (e.g., IPFS) can be linked for full sequences, with access gated by NFT ownership. Royalties are enforced via smart contract logic, taking a percentage (e.g., 10%) on every transaction or access event.

## 📜 Smart Contracts (Clarity Implementation)

This project leverages 8 interconnected Clarity smart contracts to ensure security, scalability, and decentralization. Each contract handles a specific aspect of the system:

1. **UserRegistry**: Manages anonymous user registrations and profiles. Handles principal (address) mapping to pseudonymous IDs without linking to real identities.  
2. **DataStorage**: Stores hashed genomic data, metadata (e.g., sequence type, upload timestamp), and IPFS links for off-chain full data. Ensures no duplicates via hash uniqueness.  
3. **NFTMinter**: Mints SIP-009 compliant NFTs representing ownership of specific genomic datasets. Includes metadata like data description and royalty rates.  
4. **Marketplace**: Facilitates listing, buying, and selling of data access NFTs. Supports auctions, fixed-price sales, and licensing models.  
5. **AccessControl**: Enforces permissions for data access. Only NFT holders can call functions to reveal or use data snippets.  
6. **RoyaltyDistributor**: Automates royalty payments. Calculates and distributes percentages to original owners on NFT transfers, accesses, or secondary sales using STX or fungible tokens.  
7. **DataVerifier**: Provides functions to verify data integrity (e.g., hash matching) and ownership proofs. Useful for researchers to confirm authenticity before purchase.  
8. **Governance**: Allows NFT holders to vote on platform parameters, like royalty fees or dispute rules, using a DAO-like structure for community management.  

These contracts interact seamlessly—for example, the Marketplace calls AccessControl to gate data, and every transaction triggers RoyaltyDistributor for payments. All are written in Clarity for safety and auditability, with public functions for key operations like `mint-nft`, `list-data`, and `claim-royalties`.