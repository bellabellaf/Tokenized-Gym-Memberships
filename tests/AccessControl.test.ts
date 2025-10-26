import { describe, it, expect, beforeEach } from "vitest";
import { Cl, principalCV, stringUtf8CV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_MEMBERSHIP_NOT_FOUND = 101;
const ERR_INVALID_GYM_ID = 102;
const ERR_INVALID_MEMBERSHIP = 103;
const ERR_GYM_NOT_REGISTERED = 105;
const ERR_INVALID_AUTHORITY = 106;
const ERR_MAX_ACCESS_LIMIT = 109;
const ERR_INVALID_MAX_ACCESS = 110;

interface AccessLog {
  timestamp: number;
  user: string;
  accessCount: number;
}

interface Gym {
  name: string;
  isActive: boolean;
  maxAccess: number;
}

interface Membership {
  owner: string;
  isActive: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class AccessControlMock {
  state: {
    authorityContract: string | null;
    membershipNftContract: string;
    maxAccessPerMembership: number;
    gymAccessLogs: Map<string, AccessLog>;
    gymRegistry: Map<number, Gym>;
  } = {
    authorityContract: null,
    membershipNftContract: "SP000000000000000000002Q6VF78",
    maxAccessPerMembership: 30,
    gymAccessLogs: new Map(),
    gymRegistry: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  membershipNFTMock: { getMembership: (id: number) => Membership | null } = {
    getMembership: () => null,
  };

  reset(): void {
    this.state = {
      authorityContract: null,
      membershipNftContract: "SP000000000000000000002Q6VF78",
      maxAccessPerMembership: 30,
      gymAccessLogs: new Map(),
      gymRegistry: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.membershipNFTMock = {
      getMembership: () => null,
    };
  }

  setMembershipNFTMock(mock: {
    getMembership: (id: number) => Membership | null;
  }): void {
    this.membershipNFTMock = mock;
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean | number> {
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

  setMaxAccessLimit(newLimit: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newLimit <= 0) return { ok: false, value: ERR_INVALID_MAX_ACCESS };
    this.state.maxAccessPerMembership = newLimit;
    return { ok: true, value: true };
  }

  registerGym(gymId: number, name: string, maxAccess: number): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (name.length === 0) return { ok: false, value: ERR_INVALID_GYM_ID };
    if (this.state.gymRegistry.has(gymId))
      return { ok: false, value: ERR_GYM_NOT_REGISTERED };
    if (maxAccess <= 0) return { ok: false, value: ERR_INVALID_MAX_ACCESS };
    this.state.gymRegistry.set(gymId, { name, isActive: true, maxAccess });
    return { ok: true, value: true };
  }

  verifyMembership(
    membershipId: number,
    gymId: number,
    user: string
  ): Result<boolean | number> {
    if (!this.state.gymRegistry.has(gymId))
      return { ok: false, value: ERR_GYM_NOT_REGISTERED };
    if (!this.state.gymRegistry.get(gymId)!.isActive)
      return { ok: false, value: ERR_GYM_NOT_REGISTERED };
    const membership = this.membershipNFTMock.getMembership(membershipId);
    if (!membership) return { ok: false, value: ERR_MEMBERSHIP_NOT_FOUND };
    if (membership.owner !== user || !membership.isActive)
      return { ok: false, value: ERR_INVALID_MEMBERSHIP };
    const logKey = `${membershipId}-${gymId}`;
    const log = this.state.gymAccessLogs.get(logKey);
    const accessCount = log ? log.accessCount : 0;
    const maxAccess = this.state.gymRegistry.get(gymId)!.maxAccess;
    if (accessCount >= maxAccess)
      return { ok: false, value: ERR_MAX_ACCESS_LIMIT };
    this.state.gymAccessLogs.set(logKey, {
      timestamp: this.blockHeight,
      user,
      accessCount: accessCount + 1,
    });
    return { ok: true, value: true };
  }

  toggleGymStatus(gymId: number, isActive: boolean): Result<boolean> {
    if (!this.state.authorityContract)
      return { ok: false, value: ERR_INVALID_AUTHORITY };
    if (this.caller !== this.state.authorityContract)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.gymRegistry.has(gymId))
      return { ok: false, value: ERR_GYM_NOT_REGISTERED };
    this.state.gymRegistry.set(gymId, {
      ...this.state.gymRegistry.get(gymId)!,
      isActive,
    });
    return { ok: true, value: true };
  }

  getAccessLog(membershipId: number, gymId: number): AccessLog | null {
    return this.state.gymAccessLogs.get(`${membershipId}-${gymId}`) || null;
  }

  getGym(gymId: number): Gym | null {
    return this.state.gymRegistry.get(gymId) || null;
  }
}

describe("AccessControl", () => {
  let contract: AccessControlMock;

  beforeEach(() => {
    contract = new AccessControlMock();
    contract.reset();
  });

  it("registers gym successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.registerGym(1, "FitGym", 10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getGym(1)).toEqual({
      name: "FitGym",
      isActive: true,
      maxAccess: 10,
    });
  });

  it("rejects gym registration by non-authority", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST3FAKE";
    const result = contract.registerGym(1, "FitGym", 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("verifies membership successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.registerGym(1, "FitGym", 10);
    contract.setMembershipNFTMock({
      getMembership: () => ({ owner: "ST3USER", isActive: true }),
    });
    const result = contract.verifyMembership(0, 1, "ST3USER");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getAccessLog(0, 1)).toEqual({
      timestamp: 0,
      user: "ST3USER",
      accessCount: 1,
    });
  });

  it("rejects verification for invalid membership", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.registerGym(1, "FitGym", 10);
    contract.setMembershipNFTMock({
      getMembership: () => ({ owner: "ST4USER", isActive: true }),
    });
    const result = contract.verifyMembership(0, 1, "ST3USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MEMBERSHIP);
  });

  it("rejects verification for unregistered gym", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.setMembershipNFTMock({
      getMembership: () => ({ owner: "ST3USER", isActive: true }),
    });
    const result = contract.verifyMembership(0, 1, "ST3USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_GYM_NOT_REGISTERED);
  });

  it("rejects verification when max access limit reached", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.registerGym(1, "FitGym", 1);
    contract.setMembershipNFTMock({
      getMembership: () => ({ owner: "ST3USER", isActive: true }),
    });
    contract.verifyMembership(0, 1, "ST3USER");
    const result = contract.verifyMembership(0, 1, "ST3USER");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ACCESS_LIMIT);
  });

  it("toggles gym status successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    contract.registerGym(1, "FitGym", 10);
    const result = contract.toggleGymStatus(1, false);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getGym(1)?.isActive).toBe(false);
  });

  it("sets max access limit successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setMaxAccessLimit(50);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.maxAccessPerMembership).toBe(50);
  });

  it("rejects invalid max access limit", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2TEST";
    const result = contract.setMaxAccessLimit(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_MAX_ACCESS);
  });
});
