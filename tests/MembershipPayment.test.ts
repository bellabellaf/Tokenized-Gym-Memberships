import { describe, it, expect, beforeEach } from "vitest";
import { Cl, principalCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_MEMBERSHIP_NOT_FOUND = 101;
const ERR_INVALID_AMOUNT = 102;
const ERR_INVALID_PENALTY_RATE = 103;
const ERR_INVALID_MEMBERSHIP = 104;
const ERR_INVALID_AUTHORITY = 105;
const ERR_PAYMENT_ALREADY_PROCESSED = 106;
const ERR_INVALID_TIMESTAMP = 107;
const ERR_RENEWAL_EXPIRED = 108;

interface PaymentRecord {
  amount: number;
  timestamp: number;
  user: string;
}

interface Membership {
  owner: string;
  validityPeriod: number;
  mintTimestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MembershipPaymentMock {
  state: {
    authorityContract: string | null;
    membershipNftContract: string;
    baseFee: number;
    penaltyRate: number;
    paymentRecords: Map<string, PaymentRecord>;
  } = {
    authorityContract: null,
    membershipNftContract: "SP000000000000000000002Q6VF78",
    baseFee: 500,
    penaltyRate: 10,
    paymentRecords: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  membershipNFTMock: {
    getMembership: (id: number) => Membership | null;
    updateValidity: (id: number, newValidity: number) => Result<boolean>;
  } = {
    getMembership: () => null,
    updateValidity: () => ({ ok: true, value: true }),
  };

  reset(): void {
    this.state = {
      authorityContract: null,
      membershipNftContract: "SP000000000000000000002Q6VF78",
      baseFee: 500,
      penaltyRate: 10,
      paymentRecords: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.membershipNFTMock = {
      getMembership: () => null,
      updateValidity: () => ({ ok: true, value: true }),
    };
  }

  setMembershipNFTMock(mock: {
    getMembership: (id: number) => Membership | null;
    updateValidity: (id: number, newValidity: number) => Result<boolean>;
  }): void {
    this.membershipNFTMock = mock;
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.state.authorityContract !== null)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMembershipNftContract(contractPrincipal: string): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    this.state.membershipNftContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setBaseFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee < this.state.baseFee)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    this.state.baseFee = newFee;
    return { ok: true, value: true };
  }

  setPenaltyRate(newRate: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newRate > 100) return { ok: false, value: ERR_INVALID_PENALTY_RATE };
    this.state.penaltyRate = newRate;
    return { ok: true, value: true };
  }

  processPayment(
    membershipId: number,
    cycle: number,
    amount: number
  ): Result<boolean> {
    const membership = this.membershipNFTMock.getMembership(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== this.caller)
      return { ok: false, value: ERR_INVALID_MEMBERSHIP };
    if (amount < this.state.baseFee)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    const cycleEnd =
      membership.mintTimestamp + cycle * membership.validityPeriod;
    if (cycleEnd > this.blockHeight)
      return { ok: false, value: ERR_RENEWAL_EXPIRED };
    const key = `${membershipId}-${cycle}`;
    if (this.state.paymentRecords.has(key))
      return { ok: false, value: ERR_PAYMENT_ALREADY_PROCESSED };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    this.stxTransfers.push({
      amount,
      from: this.caller,
      to: this.state.authorityContract,
    });
    this.state.paymentRecords.set(key, {
      amount,
      timestamp: this.blockHeight,
      user: this.caller,
    });
    const newValidity =
      membership.validityPeriod + cycle * membership.validityPeriod;
    this.membershipNFTMock.updateValidity(membershipId, newValidity);
    return { ok: true, value: true };
  }

  processLatePayment(
    membershipId: number,
    cycle: number,
    amount: number
  ): Result<boolean> {
    const membership = this.membershipNFTMock.getMembership(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== this.caller)
      return { ok: false, value: ERR_INVALID_MEMBERSHIP };
    if (amount < this.state.baseFee)
      return { ok: false, value: ERR_INVALID_AMOUNT };
    const cycleEnd =
      membership.mintTimestamp + cycle * membership.validityPeriod;
    if (this.blockHeight <= cycleEnd)
      return { ok: false, value: ERR_INVALID_TIMESTAMP };
    const key = `${membershipId}-${cycle}`;
    if (this.state.paymentRecords.has(key))
      return { ok: false, value: ERR_PAYMENT_ALREADY_PROCESSED };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    const penaltyAmount = Math.floor((amount * this.state.penaltyRate) / 100);
    const totalAmount = amount + penaltyAmount;
    this.stxTransfers.push({
      amount: totalAmount,
      from: this.caller,
      to: this.state.authorityContract,
    });
    this.state.paymentRecords.set(key, {
      amount: totalAmount,
      timestamp: this.blockHeight,
      user: this.caller,
    });
    const newValidity =
      membership.validityPeriod + cycle * membership.validityPeriod;
    this.membershipNFTMock.updateValidity(membershipId, newValidity);
    return { ok: true, value: true };
  }

  getPaymentRecord(membershipId: number, cycle: number): PaymentRecord | null {
    return this.state.paymentRecords.get(`${membershipId}-${cycle}`) || null;
  }
}

describe("MembershipPayment", () => {
  let contract: MembershipPaymentMock;

  beforeEach(() => {
    contract = new MembershipPaymentMock();
    contract.reset();
  });

  it("processes payment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({
        owner: "ST1TEST",
        validityPeriod: 180,
        mintTimestamp: 0,
      }),
      updateValidity: () => ({ ok: true, value: true }),
    });
    contract.blockHeight = 180;
    const result = contract.processPayment(0, 1, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getPaymentRecord(0, 1)).toEqual({
      amount: 500,
      timestamp: 180,
      user: "ST1TEST",
    });
    expect(contract.stxTransfers).toEqual([
      { amount: 500, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });

  it("processes late payment successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({
        owner: "ST1TEST",
        validityPeriod: 180,
        mintTimestamp: 0,
      }),
      updateValidity: () => ({ ok: true, value: true }),
    });
    contract.blockHeight = 181;
    const result = contract.processLatePayment(0, 1, 500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getPaymentRecord(0, 1)).toEqual({
      amount: 550,
      timestamp: 181,
      user: "ST1TEST",
    });
    expect(contract.stxTransfers).toEqual([
      { amount: 550, from: "ST1TEST", to: "ST2TEST" },
    ]);
  });

  it("rejects payment by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({
        owner: "ST3USER",
        validityPeriod: 180,
        mintTimestamp: 0,
      }),
      updateValidity: () => ({ ok: true, value: true }),
    });
    contract.blockHeight = 180;
    const result = contract.processPayment(0, 1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MEMBERSHIP);
  });

  it("rejects payment with insufficient amount", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({
        owner: "ST1TEST",
        validityPeriod: 180,
        mintTimestamp: 0,
      }),
      updateValidity: () => ({ ok: true, value: true }),
    });
    contract.blockHeight = 180;
    const result = contract.processPayment(0, 1, 400);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_AMOUNT);
  });

  it("rejects duplicate payment", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({
        owner: "ST1TEST",
        validityPeriod: 180,
        mintTimestamp: 0,
      }),
      updateValidity: () => ({ ok: true, value: true }),
    });
    contract.blockHeight = 180;
    contract.processPayment(0, 1, 500);
    const result = contract.processPayment(0, 1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAYMENT_ALREADY_PROCESSED);
  });

  it("rejects late payment before cycle end", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({
        owner: "ST1TEST",
        validityPeriod: 180,
        mintTimestamp: 0,
      }),
      updateValidity: () => ({ ok: true, value: true }),
    });
    contract.blockHeight = 179;
    const result = contract.processLatePayment(0, 1, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TIMESTAMP);
  });

  it("sets base fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setBaseFee(600);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.baseFee).toBe(600);
  });

  it("sets penalty rate successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setPenaltyRate(20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.penaltyRate).toBe(20);
  });

  it("rejects invalid penalty rate", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setPenaltyRate(101);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PENALTY_RATE);
  });
});
