import { describe, it, expect, beforeEach } from "vitest";
import { Cl, principalCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_MEMBERSHIP_NOT_FOUND = 101;
const ERR_INVALID_REWARD_AMOUNT = 102;
const ERR_INVALID_REWARD_RATE = 103;
const ERR_INVALID_MEMBERSHIP = 104;
const ERR_INVALID_AUTHORITY = 105;
const ERR_REWARD_ALREADY_CLAIMED = 106;
const ERR_INSUFFICIENT_POINTS = 107;
const ERR_INVALID_ACCESS_ID = 108;

interface RewardPoints {
  points: number;
  lastClaimed: number;
}

interface Membership {
  owner: string;
}

interface AccessLog {
  user: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class MembershipRewardsMock {
  state: {
    authorityContract: string | null;
    membershipNftContract: string;
    accessControlContract: string;
    rewardRate: number;
    minPointsToRedeem: number;
    rewardPoints: Map<string, RewardPoints>;
  } = {
    authorityContract: null,
    membershipNftContract: "SP000000000000000000002Q6VF78",
    accessControlContract: "SP000000000000000000002Q6VF78",
    rewardRate: 10,
    minPointsToRedeem: 100,
    rewardPoints: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  membershipNFTMock: { getMembership: (id: number) => Membership | null } = {
    getMembership: () => null,
  };
  accessControlMock: {
    getAccessLog: (membershipId: number, gymId: number) => AccessLog | null;
  } = { getAccessLog: () => null };

  reset(): void {
    this.state = {
      authorityContract: null,
      membershipNftContract: "SP000000000000000000002Q6VF78",
      accessControlContract: "SP000000000000000000002Q6VF78",
      rewardRate: 10,
      minPointsToRedeem: 100,
      rewardPoints: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.membershipNFTMock = { getMembership: () => null };
    this.accessControlMock = { getAccessLog: () => null };
  }

  setMocks(
    membershipMock: { getMembership: (id: number) => Membership | null },
    accessMock: {
      getAccessLog: (membershipId: number, gymId: number) => AccessLog | null;
    }
  ): void {
    this.membershipNFTMock = membershipMock;
    this.accessControlMock = accessMock;
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

  setAccessControlContract(contractPrincipal: string): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (contractPrincipal === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    this.state.accessControlContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRewardRate(newRate: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newRate > 50) return { ok: false, value: ERR_INVALID_REWARD_RATE };
    this.state.rewardRate = newRate;
    return { ok: true, value: true };
  }

  setMinPointsToRedeem(newMin: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newMin <= 0) return { ok: false, value: ERR_INVALID_REWARD_AMOUNT };
    this.state.minPointsToRedeem = newMin;
    return { ok: true, value: true };
  }

  awardPoints(
    membershipId: number,
    gymId: number,
    user: string
  ): Result<boolean> {
    const membership = this.membershipNFTMock.getMembership(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== user)
      return { ok: false, value: ERR_INVALID_MEMBERSHIP };
    const accessLog = this.accessControlMock.getAccessLog(membershipId, gymId);
    if (!accessLog || accessLog.user !== user)
      return { ok: false, value: ERR_INVALID_ACCESS_ID };
    const key = `${membershipId}`;
    if (this.state.rewardPoints.has(key))
      return { ok: false, value: ERR_REWARD_ALREADY_CLAIMED };
    this.state.rewardPoints.set(key, {
      points: this.state.rewardRate,
      lastClaimed: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  redeemRewards(membershipId: number, amount: number): Result<boolean> {
    const membership = this.membershipNFTMock.getMembership(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== this.caller)
      return { ok: false, value: ERR_INVALID_MEMBERSHIP };
    const pointsData = this.state.rewardPoints.get(`${membershipId}`);
    if (!pointsData) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (
      pointsData.points < this.state.minPointsToRedeem ||
      pointsData.points < amount
    )
      return { ok: false, value: ERR_INSUFFICIENT_POINTS };
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    this.stxTransfers.push({
      amount,
      from: this.caller,
      to: this.state.authorityContract,
    });
    this.state.rewardPoints.set(`${membershipId}`, {
      points: pointsData.points - amount,
      lastClaimed: this.blockHeight,
    });
    return { ok: true, value: true };
  }

  getRewardPoints(membershipId: number): RewardPoints | null {
    return this.state.rewardPoints.get(`${membershipId}`) || null;
  }
}

describe("MembershipRewards", () => {
  let contract: MembershipRewardsMock;

  beforeEach(() => {
    contract = new MembershipRewardsMock();
    contract.reset();
  });

  it("awards points successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMocks(
      { getMembership: () => ({ owner: "ST1TEST" }) },
      { getAccessLog: () => ({ user: "ST1TEST" }) }
    );
    const result = contract.awardPoints(0, 1, "ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getRewardPoints(0)).toEqual({ points: 10, lastClaimed: 0 });
  });

  it("rejects points award for invalid membership", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMocks(
      { getMembership: () => ({ owner: "ST3USER" }) },
      { getAccessLog: () => ({ user: "ST1TEST" }) }
    );
    const result = contract.awardPoints(0, 1, "ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MEMBERSHIP);
  });

  it("rejects points award for invalid access log", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMocks(
      { getMembership: () => ({ owner: "ST1TEST" }) },
      { getAccessLog: () => null }
    );
    const result = contract.awardPoints(0, 1, "ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ACCESS_ID);
  });

  it("rejects duplicate points award", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMocks(
      { getMembership: () => ({ owner: "ST1TEST" }) },
      { getAccessLog: () => ({ user: "ST1TEST" }) }
    );
    contract.awardPoints(0, 1, "ST1TEST");
    const result = contract.awardPoints(0, 1, "ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REWARD_ALREADY_CLAIMED);
  });

  it("rejects redemption with insufficient points", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMocks(
      { getMembership: () => ({ owner: "ST1TEST" }) },
      { getAccessLog: () => ({ user: "ST1TEST" }) }
    );
    contract.awardPoints(0, 1, "ST1TEST");
    const result = contract.redeemRewards(0, 200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_POINTS);
  });

  it("sets reward rate successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setRewardRate(20);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.rewardRate).toBe(20);
  });

  it("rejects invalid reward rate", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setRewardRate(51);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REWARD_RATE);
  });

  it("sets min points to redeem successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setMinPointsToRedeem(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.minPointsToRedeem).toBe(200);
  });
});
