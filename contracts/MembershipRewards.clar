(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-MEMBERSHIP-NOT-FOUND u101)
(define-constant ERR-INVALID-REWARD-AMOUNT u102)
(define-constant ERR-INVALID-REWARD-RATE u103)
(define-constant ERR-INVALID-MEMBERSHIP u104)
(define-constant ERR-INVALID-AUTHORITY u105)
(define-constant ERR-REWARD-ALREADY-CLAIMED u106)
(define-constant ERR-INSUFFICIENT-POINTS u107)
(define-constant ERR-INVALID-ACCESS-ID u108)

(define-data-var authority-contract (optional principal) none)
(define-data-var membership-nft-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var access-control-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var reward-rate uint u10)
(define-data-var min-points-to-redeem uint u100)

(define-map reward-points
  { membership-id: uint }
  { points: uint, last-claimed: uint }
)

(define-read-only (get-reward-points (membership-id uint))
  (map-get? reward-points { membership-id: membership-id })
)

(define-read-only (get-reward-rate)
  (var-get reward-rate)
)

(define-read-only (get-min-points-to-redeem)
  (var-get min-points-to-redeem)
)

(define-private (validate-membership (membership-id uint) (user principal))
  (let
    (
      (membership (unwrap! (contract-call? .MembershipNFT get-membership membership-id) (err ERR-MEMBERSHIP-NOT-FOUND)))
    )
    (if (is-eq (get owner membership) user)
      (ok true)
      (err ERR-INVALID-MEMBERSHIP))
  )
)

(define-private (validate-reward-amount (amount uint))
  (if (> amount u0)
    (ok true)
    (err ERR-INVALID-REWARD-AMOUNT))
)

(define-private (validate-reward-rate (rate uint))
  (if (<= rate u50)
    (ok true)
    (err ERR-INVALID-REWARD-RATE))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-AUTHORITY))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-membership-nft-contract (contract-principal principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-AUTHORITY))
    (var-set membership-nft-contract contract-principal)
    (ok true)
  )
)

(define-public (set-access-control-contract (contract-principal principal))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq contract-principal 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-AUTHORITY))
    (var-set access-control-contract contract-principal)
    (ok true)
  )
)

(define-public (set-reward-rate (new-rate uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-reward-rate new-rate))
    (var-set reward-rate new-rate)
    (ok true)
  )
)

(define-public (set-min-points-to-redeem (new-min uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-reward-amount new-min))
    (var-set min-points-to-redeem new-min)
    (ok true)
  )
)

(define-public (award-points (membership-id uint) (gym-id uint) (user principal))
  (let
    (
      (access-log (unwrap! (contract-call? .AccessControl get-access-log membership-id gym-id) (err ERR-INVALID-ACCESS-ID)))
      (points (default-to u0 (get points (map-get? reward-points { membership-id: membership-id }))))
    )
    (try! (validate-membership membership-id user))
    (asserts! (is-eq (get user access-log) user) (err ERR-INVALID-ACCESS-ID))
    (asserts! (is-none (map-get? reward-points { membership-id: membership-id })) (err ERR-REWARD-ALREADY-CLAIMED))
    (map-set reward-points { membership-id: membership-id } { points: (+ points (var-get reward-rate)), last-claimed: block-height })
    (print { event: "points-awarded", membership-id: membership-id, points: (var-get reward-rate) })
    (ok true)
  )
)

(define-public (redeem-rewards (membership-id uint) (amount uint))
  (let
    (
      (points-data (unwrap! (map-get? reward-points { membership-id: membership-id }) (err ERR-MEMBERSHIP-NOT-FOUND)))
      (current-points (get points points-data))
      (authority (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY)))
    )
    (try! (validate-membership membership-id tx-sender))
    (asserts! (>= current-points (var-get min-points-to-redeem)) (err ERR-INSUFFICIENT-POINTS))
    (asserts! (>= current-points amount) (err ERR-INSUFFICIENT-POINTS))
    (try! (stx-transfer? amount tx-sender authority))
    (map-set reward-points { membership-id: membership-id } { points: (- current-points amount), last-claimed: block-height })
    (print { event: "rewards-redeemed", membership-id: membership-id, amount: amount })
    (ok true)
  )
)