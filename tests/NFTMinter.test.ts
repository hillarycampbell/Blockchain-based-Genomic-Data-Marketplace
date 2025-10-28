import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringAsciiCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_DATA_ID = 201;
const ERR_DATA_NOT_FOUND = 202;
const ERR_NFT_ALREADY_MINTED = 203;
const ERR_INVALID_ROYALTY_RATE = 204;
const ERR_INVALID_METADATA_URI = 205;
const ERR_MAX_NFTS_EXCEEDED = 208;
const ERR_AUTHORITY_NOT_VERIFIED = 210;

interface NFTMetadata {
  dataId: number;
  owner: string;
  royaltyRate: number;
  metadataUri: string;
  timestamp: number;
  status: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class DataStorageMock {
  getData(id: number): { owner: string } | null {
    if (id === 0) return { owner: "ST1TEST" };
    return null;
  }
}

class NFTMinterMock {
  state: {
    nextNftId: number;
    maxNfts: number;
    mintFee: number;
    authorityContract: string | null;
    nftMetadata: Map<number, NFTMetadata>;
    nftsByData: Map<number, number>;
  } = {
    nextNftId: 0,
    maxNfts: 5000,
    mintFee: 1000,
    authorityContract: null,
    nftMetadata: new Map(),
    nftsByData: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  dataStorage: DataStorageMock;

  constructor() {
    this.dataStorage = new DataStorageMock();
    this.reset();
  }

  reset() {
    this.state = {
      nextNftId: 0,
      maxNfts: 5000,
      mintFee: 1000,
      authorityContract: null,
      nftMetadata: new Map(),
      nftsByData: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  mintNft(dataId: number, royaltyRate: number, metadataUri: string): Result<number> {
    if (this.state.nextNftId >= this.state.maxNfts) return { ok: false, value: ERR_MAX_NFTS_EXCEEDED };
    if (royaltyRate > 20) return { ok: false, value: ERR_INVALID_ROYALTY_RATE };
    if (metadataUri.length === 0 || metadataUri.length > 256) return { ok: false, value: ERR_INVALID_METADATA_URI };
    const data = this.dataStorage.getData(dataId);
    if (!data) return { ok: false, value: ERR_DATA_NOT_FOUND };
    if (data.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.nftsByData.has(dataId)) return { ok: false, value: ERR_NFT_ALREADY_MINTED };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextNftId;
    this.state.nftMetadata.set(id, {
      dataId,
      owner: this.caller,
      royaltyRate,
      metadataUri,
      timestamp: this.blockHeight,
      status: true,
    });
    this.state.nftsByData.set(dataId, id);
    this.state.nextNftId++;
    return { ok: true, value: id };
  }

  transferNft(nftId: number, recipient: string): Result<boolean> {
    const meta = this.state.nftMetadata.get(nftId);
    if (!meta) return { ok: false, value: false };
    if (meta.owner !== this.caller) return { ok: false, value: false };
    this.state.nftMetadata.set(nftId, { ...meta, owner: recipient });
    return { ok: true, value: true };
  }

  getNftCount(): Result<number> {
    return { ok: true, value: this.state.nextNftId };
  }
}

describe("NFTMinter", () => {
  let contract: NFTMinterMock;

  beforeEach(() => {
    contract = new NFTMinterMock();
    contract.reset();
  });

  it("mints NFT successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintNft(0, 10, "ipfs://metadata");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
    const meta = contract.state.nftMetadata.get(0);
    expect(meta?.royaltyRate).toBe(10);
    expect(meta?.metadataUri).toBe("ipfs://metadata");
  });

  it("rejects mint for non-existent data", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintNft(99, 10, "ipfs://metadata");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DATA_NOT_FOUND);
  });

  it("rejects mint by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST3FAKE";
    const result = contract.mintNft(0, 10, "ipfs://metadata");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects duplicate NFT for same data", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintNft(0, 10, "ipfs://metadata1");
    const result = contract.mintNft(0, 15, "ipfs://metadata2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NFT_ALREADY_MINTED);
  });

  it("rejects invalid royalty rate", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintNft(0, 25, "ipfs://metadata");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROYALTY_RATE);
  });

  it("rejects mint without authority contract", () => {
    const result = contract.mintNft(0, 10, "ipfs://metadata");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("transfers NFT successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintNft(0, 10, "ipfs://metadata");
    const result = contract.transferNft(0, "ST2NEW");
    expect(result.ok).toBe(true);
    const meta = contract.state.nftMetadata.get(0);
    expect(meta?.owner).toBe("ST2NEW");
  });

  it("rejects transfer by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintNft(0, 10, "ipfs://metadata");
    contract.caller = "ST3FAKE";
    const result = contract.transferNft(0, "ST2NEW");
    expect(result.ok).toBe(false);
  });

  it("sets mint fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMintFee(2000);
    expect(result.ok).toBe(true);
    expect(contract.state.mintFee).toBe(2000);
    contract.mintNft(0, 10, "ipfs://metadata");
    expect(contract.stxTransfers).toEqual([{ amount: 2000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("returns correct NFT count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintNft(0, 10, "ipfs://meta1");
    const result = contract.getNftCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("rejects mint when max NFTs exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxNfts = 1;
    contract.mintNft(0, 10, "ipfs://meta1");
    const result = contract.mintNft(0, 10, "ipfs://meta2");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_NFTS_EXCEEDED);
  });
});