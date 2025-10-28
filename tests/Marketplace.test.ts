import { describe, it, expect, beforeEach } from "vitest";
import { uintCV, stringAsciiCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_NFT_NOT_FOUND = 302;
const ERR_LISTING_EXISTS = 303;
const ERR_INVALID_PRICE = 304;
const ERR_INVALID_CURRENCY = 305;
const ERR_INVALID_LISTING_TYPE = 313;
const ERR_INVALID_EXPIRY = 309;
const ERR_MAX_LISTINGS_EXCEEDED = 310;
const ERR_AUTHORITY_NOT_VERIFIED = 311;
const ERR_LISTING_NOT_FOUND = 307;

interface Listing {
  nftId: number;
  owner: string;
  price: number;
  currency: string;
  listingType: string;
  expiry: number;
  discount: number;
  status: boolean;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class NFTMinterMock {
  getNft(id: number): string | null {
    if (id === 0) return "ST1TEST";
    return null;
  }
}

class MarketplaceMock {
  state: {
    nextListingId: number;
    maxListings: number;
    listingFee: number;
    authorityContract: string | null;
    listings: Map<number, Listing>;
    listingsByNft: Map<number, number>;
    activeListings: Map<string, number[]>;
  } = {
    nextListingId: 0,
    maxListings: 1000,
    listingFee: 250,
    authorityContract: null,
    listings: new Map(),
    listingsByNft: new Map(),
    activeListings: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  nftMinter: NFTMinterMock;

  constructor() {
    this.nftMinter = new NFTMinterMock();
    this.reset();
  }

  reset() {
    this.state = {
      nextListingId: 0,
      maxListings: 1000,
      listingFee: 250,
      authorityContract: null,
      listings: new Map(),
      listingsByNft: new Map(),
      activeListings: new Map(),
    };
    this.blockHeight = 100;
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

  setListingFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.listingFee = newFee;
    return { ok: true, value: true };
  }

  createListing(
    nftId: number,
    price: number,
    currency: string,
    listingType: string,
    expiry: number,
    discount: number
  ): Result<number> {
    if (this.state.nextListingId >= this.state.maxListings)
      return { ok: false, value: ERR_MAX_LISTINGS_EXCEEDED };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (!["STX", "USD", "BTC"].includes(currency))
      return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!["fixed", "auction"].includes(listingType))
      return { ok: false, value: ERR_INVALID_LISTING_TYPE };
    if (expiry <= this.blockHeight)
      return { ok: false, value: ERR_INVALID_EXPIRY };
    if (discount > 100) return { ok: false, value: 312 };
    const owner = this.nftMinter.getNft(nftId);
    if (!owner) return { ok: false, value: ERR_NFT_NOT_FOUND };
    if (owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.listingsByNft.has(nftId))
      return { ok: false, value: ERR_LISTING_EXISTS };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };

    this.stxTransfers.push({
      amount: this.state.listingFee,
      from: this.caller,
      to: this.state.authorityContract,
    });

    const id = this.state.nextListingId;
    const listing: Listing = {
      nftId,
      owner: this.caller,
      price,
      currency,
      listingType,
      expiry,
      discount,
      status: true,
      timestamp: this.blockHeight,
    };
    this.state.listings.set(id, listing);
    this.state.listingsByNft.set(nftId, id);
    const active = this.state.activeListings.get(this.caller) || [];
    this.state.activeListings.set(this.caller, [...active, id]);
    this.state.nextListingId++;
    return { ok: true, value: id };
  }

  cancelListing(listingId: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing) return { ok: false, value: false };
    if (listing.owner !== this.caller) return { ok: false, value: false };
    this.state.listings.set(listingId, { ...listing, status: false });
    const active = this.state.activeListings.get(this.caller) || [];
    this.state.activeListings.set(
      this.caller,
      active.filter((id) => id !== listingId)
    );
    return { ok: true, value: true };
  }

  updatePrice(listingId: number, newPrice: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing) return { ok: false, value: false };
    if (listing.owner !== this.caller) return { ok: false, value: false };
    if (!listing.status) return { ok: false, value: false };
    if (newPrice <= 0) return { ok: false, value: false };
    this.state.listings.set(listingId, { ...listing, price: newPrice });
    return { ok: true, value: true };
  }

  getListingCount(): Result<number> {
    return { ok: true, value: this.state.nextListingId };
  }
}

describe("Marketplace", () => {
  let contract: MarketplaceMock;

  beforeEach(() => {
    contract = new MarketplaceMock();
    contract.reset();
  });

  it("creates listing successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    expect(contract.stxTransfers).toEqual([
      { amount: 250, from: "ST1TEST", to: "ST2TEST" },
    ]);
    const listing = contract.state.listings.get(0);
    expect(listing?.price).toBe(5000);
    expect(listing?.currency).toBe("STX");
    expect(listing?.listingType).toBe("fixed");
  });

  it("rejects listing for non-owned NFT", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST3FAKE";
    const result = contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects duplicate listing for same NFT", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    const result = contract.createListing(0, 6000, "USD", "auction", 300, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_LISTING_EXISTS);
  });

  it("rejects invalid currency", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createListing(0, 5000, "ETH", "fixed", 200, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("rejects zero price", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createListing(0, 0, "STX", "fixed", 200, 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRICE);
  });

  it("cancels listing successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    const result = contract.cancelListing(0);
    expect(result.ok).toBe(true);
    const listing = contract.state.listings.get(0);
    expect(listing?.status).toBe(false);
    expect(contract.state.activeListings.get("ST1TEST")).toEqual([]);
  });

  it("updates price successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    const result = contract.updatePrice(0, 7500);
    expect(result.ok).toBe(true);
    const listing = contract.state.listings.get(0);
    expect(listing?.price).toBe(7500);
  });

  it("rejects price update on cancelled listing", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    contract.cancelListing(0);
    const result = contract.updatePrice(0, 7500);
    expect(result.ok).toBe(false);
  });
  it("sets listing fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setListingFee(500);
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });

  it("returns correct listing count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    const result = contract.getListingCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("rejects listing when max exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxListings = 1;
    contract.createListing(0, 5000, "STX", "fixed", 200, 10);
    contract.caller = "ST2OTHER";
    const result = contract.createListing(0, 6000, "USD", "auction", 300, 5);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_LISTINGS_EXCEEDED);
  });
});
