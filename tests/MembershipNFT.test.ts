import { describe, it, expect, beforeEach } from "vitest";
import { Cl, stringUtf8CV, uintCV, principalCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_MEMBERSHIP_ID = 101;
const ERR_INVALID_MINT_FEE = 102;
const ERR_INVALID_VALIDITY_PERIOD = 103;
const ERR_MEMBERSHIP_NOT_FOUND = 104;
const ERR_ALREADY_MINTED = 105;
const ERR_TRANSFER_NOT_ALLOWED = 106;
const ERR_INVALID_RECIPIENT = 107;
const ERR_INVALID_METADATA = 108;
const ERR_MAX_MEMBERSHIPS_EXCEEDED = 109;
const ERR_INVALID_AUTHORITY = 110;
const ERR_INVALID_TIER = 111;

interface Membership {
  owner: string;
  tier: string;
  validityPeriod: number;
  mintTimestamp: number;
  metadata: string;
  isActive: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MembershipNFTMock {
  state: {
    nextMembershipId: number;
    maxMemberships: number;
    mintFee: number;
    authorityContract: string | null;
    memberships: Map<number, Membership>;
    membershipByOwner: Map<string, number[]>;
  } = {
    nextMembershipId: 0,
    maxMemberships: 10000,
    mintFee: 500,
    authorityContract: null,
    memberships: new Map(),
    membershipByOwner: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  reset(): void {
    this.state = {
      nextMembershipId: 0,
      maxMemberships: 10000,
      mintFee: 500,
      authorityContract: null,
      memberships: new Map(),
      membershipByOwner: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.state.authorityContract !== null) return { ok: false, value: ERR_INVALID_AUTHORITY };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (newFee < 0) return { ok: false, value: ERR_INVALID_MINT_FEE };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  mintMembership(recipient: string, tier: string, validityPeriod: number, metadata: string): Result<number> {
    if (this.state.nextMembershipId >= this.state.maxMemberships) return { ok: false, value: ERR_MAX_MEMBERSHIPS_EXCEEDED };
    if (!["basic", "premium", "elite"].includes(tier)) return { ok: false, value: ERR_INVALID_TIER };
    if (validityPeriod <= 0 || validityPeriod > 365) return { ok: false, value: ERR_INVALID_VALIDITY_PERIOD };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (!this.state.authorityContract) return { ok: false, value: ERR_INVALID_AUTHORITY };

    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextMembershipId;
    const membership: Membership = { owner: recipient, tier, validityPeriod, mintTimestamp: this.blockHeight, metadata, isActive: true };
    this.state.memberships.set(id, membership);
    const ownerMemberships = this.state.membershipByOwner.get(recipient) || [];
    if (ownerMemberships.length >= 100) return { ok: false, value: ERR_MAX_MEMBERSHIPS_EXCEEDED };
    this.state.membershipByOwner.set(recipient, [...ownerMemberships, id]);
    this.state.nextMembershipId++;
    return { ok: true, value: id };
  }

  transferMembership(membershipId: number, recipient: string): Result<boolean> {
    const membership = this.state.memberships.get(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!membership.isActive) return { ok: false, value: ERR_TRANSFER_NOT_ALLOWED };
    if (recipient === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_RECIPIENT };

    this.state.memberships.set(membershipId, { ...membership, owner: recipient });
    const ownerMemberships = this.state.membershipByOwner.get(this.caller)!.filter(id => id !== membershipId);
    this.state.membershipByOwner.set(this.caller, ownerMemberships);
    const recipientMemberships = this.state.membershipByOwner.get(recipient) || [];
    if (recipientMemberships.length >= 100) return { ok: false, value: ERR_MAX_MEMBERSHIPS_EXCEEDED };
    this.state.membershipByOwner.set(recipient, [...recipientMemberships, membershipId]);
    return { ok: true, value: true };
  }

  deactivateMembership(membershipId: number): Result<boolean> {
    const membership = this.state.memberships.get(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!membership.isActive) return { ok: false, value: ERR_TRANSFER_NOT_ALLOWED };
    this.state.memberships.set(membershipId, { ...membership, isActive: false });
    return { ok: true, value: true };
  }

  getMembership(id: number): Membership | null {
    return this.state.memberships.get(id) || null;
  }

  getMembershipsByOwner(owner: string): number[] {
    return this.state.membershipByOwner.get(owner) || [];
  }
}

describe("MembershipNFT", () => {
  let contract: MembershipNFTMock;

  beforeEach(() => {
    contract = new MembershipNFTMock();
    contract.reset();
  });

  it("mints a membership successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintMembership("ST3USER", "premium", 180, "Membership for premium access");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const membership = contract.getMembership(0);
    expect(membership).toEqual({
      owner: "ST3USER",
      tier: "premium",
      validityPeriod: 180,
      mintTimestamp: 0,
      metadata: "Membership for premium access",
      isActive: true,
    });
    expect(contract.getMembershipsByOwner("ST3USER")).toEqual([0]);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects mint with invalid tier", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintMembership("ST3USER", "invalid", 180, "Invalid tier test");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIER);
  });

  it("rejects mint with invalid validity period", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintMembership("ST3USER", "premium", 366, "Too long validity");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VALIDITY_PERIOD);
  });

  it("rejects mint with invalid recipient", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.mintMembership("SP000000000000000000002Q6VF78", "premium", 180, "Invalid recipient");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RECIPIENT);
  });

  it("transfers membership successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintMembership("ST1TEST", "premium", 180, "Membership for premium access");
    const result = contract.transferMembership(0, "ST4USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const membership = contract.getMembership(0);
    expect(membership?.owner).toBe("ST4USER");
    expect(contract.getMembershipsByOwner("ST1TEST")).toEqual([]);
    expect(contract.getMembershipsByOwner("ST4USER")).toEqual([0]);
  });

  it("rejects transfer by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintMembership("ST1TEST", "premium", 180, "Membership for premium access");
    contract.caller = "ST5FAKE";
    const result = contract.transferMembership(0, "ST4USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("deactivates membership successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintMembership("ST1TEST", "premium", 180, "Membership for premium access");
    const result = contract.deactivateMembership(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const membership = contract.getMembership(0);
    expect(membership?.isActive).toBe(false);
  });

  it("rejects deactivation by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.mintMembership("ST1TEST", "premium", 180, "Membership for premium access");
    contract.caller = "ST5FAKE";
    const result = contract.deactivateMembership(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets mint fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMintFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.mintFee).toBe(1000);
  });
});