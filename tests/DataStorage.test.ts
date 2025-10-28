import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, buffCV, optionalCV, listCV, stringUtf8CV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_METADATA = 102;
const ERR_INVALID_IPFS_LINK = 103;
const ERR_DATA_ALREADY_EXISTS = 104;
const ERR_DATA_NOT_FOUND = 105;
const ERR_INVALID_SEQUENCE_TYPE = 107;
const ERR_INVALID_VISIBILITY = 115;
const ERR_INVALID_EXPIRY = 116;
const ERR_INVALID_CATEGORY = 117;
const ERR_INVALID_TAGS = 118;
const ERR_INVALID_DESCRIPTION = 119;
const ERR_AUTHORITY_NOT_VERIFIED = 120;
const ERR_MAX_DATA_EXCEEDED = 113;
const ERR_INVALID_UPDATE_PARAM = 111;

interface GenomicData {
  owner: string;
  hash: Uint8Array;
  ipfsLink: string | null;
  metadata: string;
  timestamp: number;
  sequenceType: string;
  status: boolean;
  visibility: string;
  expiry: number;
  category: string;
  tags: string[];
  description: string;
}

interface DataUpdate {
  updateMetadata: string;
  updateIpfsLink: string | null;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class DataStorageMock {
  state: {
    nextDataId: number;
    maxDataEntries: number;
    registrationFee: number;
    authorityContract: string | null;
    genomicData: Map<number, GenomicData>;
    dataUpdates: Map<number, DataUpdate>;
    dataByHash: Map<string, number>;
    accessLogs: Map<number, { accessor: string; accessTime: number }[]>;
  } = {
    nextDataId: 0,
    maxDataEntries: 10000,
    registrationFee: 500,
    authorityContract: null,
    genomicData: new Map(),
    dataUpdates: new Map(),
    dataByHash: new Map(),
    accessLogs: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextDataId: 0,
      maxDataEntries: 10000,
      registrationFee: 500,
      authorityContract: null,
      genomicData: new Map(),
      dataUpdates: new Map(),
      dataByHash: new Map(),
      accessLogs: new Map(),
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

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerData(
    hash: Uint8Array,
    ipfsLink: string | null,
    metadata: string,
    sequenceType: string,
    visibility: string,
    expiry: number,
    category: string,
    tags: string[],
    description: string
  ): Result<number> {
    if (this.state.nextDataId >= this.state.maxDataEntries) return { ok: false, value: ERR_MAX_DATA_EXCEEDED };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (metadata.length === 0 || metadata.length > 512) return { ok: false, value: ERR_INVALID_METADATA };
    if (ipfsLink && ipfsLink.length > 256) return { ok: false, value: ERR_INVALID_IPFS_LINK };
    if (!["whole-genome", "exome", "targeted"].includes(sequenceType)) return { ok: false, value: ERR_INVALID_SEQUENCE_TYPE };
    if (!["public", "private", "restricted"].includes(visibility)) return { ok: false, value: ERR_INVALID_VISIBILITY };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    if (category.length === 0 || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (tags.length > 10) return { ok: false, value: ERR_INVALID_TAGS };
    if (description.length > 1024) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    const hashKey = hash.toString();
    if (this.state.dataByHash.has(hashKey)) return { ok: false, value: ERR_DATA_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextDataId;
    const data: GenomicData = {
      owner: this.caller,
      hash,
      ipfsLink,
      metadata,
      timestamp: this.blockHeight,
      sequenceType,
      status: true,
      visibility,
      expiry,
      category,
      tags,
      description,
    };
    this.state.genomicData.set(id, data);
    this.state.dataByHash.set(hashKey, id);
    this.state.nextDataId++;
    return { ok: true, value: id };
  }

  getData(id: number): GenomicData | null {
    return this.state.genomicData.get(id) || null;
  }

  updateData(id: number, updateMetadata: string, updateIpfsLink: string | null): Result<boolean> {
    const data = this.state.genomicData.get(id);
    if (!data) return { ok: false, value: false };
    if (data.owner !== this.caller) return { ok: false, value: false };
    if (updateMetadata.length === 0 || updateMetadata.length > 512) return { ok: false, value: false };
    if (updateIpfsLink && updateIpfsLink.length > 256) return { ok: false, value: false };

    const updated: GenomicData = {
      ...data,
      metadata: updateMetadata,
      ipfsLink: updateIpfsLink,
      timestamp: this.blockHeight,
    };
    this.state.genomicData.set(id, updated);
    this.state.dataUpdates.set(id, {
      updateMetadata,
      updateIpfsLink,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  logAccess(id: number): Result<boolean> {
    const data = this.state.genomicData.get(id);
    if (!data) return { ok: false, value: false };
    if (data.visibility === "private") return { ok: false, value: false };
    let logs = this.state.accessLogs.get(id) || [];
    logs = [...logs, { accessor: this.caller, accessTime: this.blockHeight }];
    this.state.accessLogs.set(id, logs);
    return { ok: true, value: true };
  }

  getDataCount(): Result<number> {
    return { ok: true, value: this.state.nextDataId };
  }

  checkDataExistence(hash: Uint8Array): Result<boolean> {
    return { ok: true, value: this.state.dataByHash.has(hash.toString()) };
  }
}

describe("DataStorage", () => {
  let contract: DataStorageMock;

  beforeEach(() => {
    contract = new DataStorageMock();
    contract.reset();
  });

  it("registers data successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const data = contract.getData(0);
    expect(data?.metadata).toBe("meta");
    expect(data?.sequenceType).toBe("whole-genome");
    expect(data?.visibility).toBe("public");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate data hashes", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    const result = contract.registerData(
      hash,
      "ipfs://other",
      "othermeta",
      "exome",
      "restricted",
      200,
      "othercat",
      ["tag2"],
      "otherdesc"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DATA_ALREADY_EXISTS);
  });

  it("rejects registration without authority contract", () => {
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects invalid hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(31).fill(1);
    const result = contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid sequence type", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    const result = contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "invalid",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SEQUENCE_TYPE);
  });

  it("updates data successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    const result = contract.updateData(0, "newmeta", "ipfs://new");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const data = contract.getData(0);
    expect(data?.metadata).toBe("newmeta");
    expect(data?.ipfsLink).toBe("ipfs://new");
    const update = contract.state.dataUpdates.get(0);
    expect(update?.updateMetadata).toBe("newmeta");
    expect(update?.updateIpfsLink).toBe("ipfs://new");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent data", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateData(99, "newmeta", "ipfs://new");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateData(0, "newmeta", "ipfs://new");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects registration fee change without authority", () => {
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct data count", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash1 = new Uint8Array(32).fill(1);
    const hash2 = new Uint8Array(32).fill(2);
    contract.registerData(
      hash1,
      "ipfs://example1",
      "meta1",
      "whole-genome",
      "public",
      100,
      "cat1",
      ["tag1"],
      "desc1"
    );
    contract.registerData(
      hash2,
      "ipfs://example2",
      "meta2",
      "exome",
      "restricted",
      200,
      "cat2",
      ["tag2"],
      "desc2"
    );
    const result = contract.getDataCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks data existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    const result = contract.checkDataExistence(hash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const fakeHash = new Uint8Array(32).fill(0);
    const result2 = contract.checkDataExistence(fakeHash);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("logs access successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "public",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    const result = contract.logAccess(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const logs = contract.state.accessLogs.get(0);
    expect(logs?.length).toBe(1);
    expect(logs?.[0].accessor).toBe("ST1TEST");
  });

  it("rejects access log for private data", () => {
    contract.setAuthorityContract("ST2TEST");
    const hash = new Uint8Array(32).fill(1);
    contract.registerData(
      hash,
      "ipfs://example",
      "meta",
      "whole-genome",
      "private",
      100,
      "cat",
      ["tag1"],
      "desc"
    );
    const result = contract.logAccess(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects registration with max data exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxDataEntries = 1;
    const hash1 = new Uint8Array(32).fill(1);
    contract.registerData(
      hash1,
      "ipfs://example1",
      "meta1",
      "whole-genome",
      "public",
      100,
      "cat1",
      ["tag1"],
      "desc1"
    );
    const hash2 = new Uint8Array(32).fill(2);
    const result = contract.registerData(
      hash2,
      "ipfs://example2",
      "meta2",
      "exome",
      "restricted",
      200,
      "cat2",
      ["tag2"],
      "desc2"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_DATA_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});