(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-MEMBERSHIP-NOT-FOUND u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-INVALID-PENALTY-RATE u103)
(define-constant ERR-INVALID-MEMBERSHIP u104)
(define-constant ERR-INVALID-AUTHORITY u105)
(define-constant ERR-PAYMENT-ALREADY-PROCESSED u106)
(define-constant ERR-INVALID-TIMESTAMP u107)
(define-constant ERR-RENEWAL-EXPIRED u108)

(define-data-var authority-contract (optional principal) none)
(define-data-var membership-nft-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var base-fee uint u500)
(define-data-var penalty-rate uint u10)

(define-map payment-records
  { membership-id: uint, cycle: uint }
  { amount: uint, timestamp: uint, user: principal }
)

(define-read-only (get-payment-record (membership-id uint) (cycle uint))
  (map-get? payment-records { membership-id: membership-id, cycle: cycle })
)

(define-read-only (get-base-fee)
  (var-get base-fee)
)

(define-read-only (get-penalty-rate)
  (var-get penalty-rate)
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

(define-private (validate-amount (amount uint))
  (if (>= amount (var-get base-fee))
    (ok true)
    (err ERR-INVALID-AMOUNT))
)

(define-private (validate-penalty-rate (rate uint))
  (if (<= rate u100)
    (ok true)
    (err ERR-INVALID-PENALTY-RATE))
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

(define-public (set-base-fee (new-fee uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-amount new-fee))
    (var-set base-fee new-fee)
    (ok true)
  )
)

(define-public (set-penalty-rate (new-rate uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-penalty-rate new-rate))
    (var-set penalty-rate new-rate)
    (ok true)
  )
)

(define-public (process-payment (membership-id uint) (cycle uint) (amount uint))
  (let
    (
      (membership (unwrap! (contract-call? .MembershipNFT get-membership membership-id) (err ERR-MEMBERSHIP-NOT-FOUND)))
      (authority (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY)))
      (validity-period (get validity-period membership))
      (mint-timestamp (get mint-timestamp membership))
      (cycle-end (+ mint-timestamp (* cycle validity-period)))
    )
    (try! (validate-membership membership-id tx-sender))
    (try! (validate-amount amount))
    (asserts! (<= cycle-end block-height) (err ERR-RENEWAL-EXPIRED))
    (asserts! (is-none (map-get? payment-records { membership-id: membership-id, cycle: cycle })) (err ERR-PAYMENT-ALREADY-PROCESSED))
    (try! (stx-transfer? amount tx-sender authority))
    (map-set payment-records { membership-id: membership-id, cycle: cycle } { amount: amount, timestamp: block-height, user: tx-sender })
    (try! (contract-call? .MembershipNFT update-validity membership-id (+ validity-period (* cycle validity-period))))
    (print { event: "payment-processed", membership-id: membership-id, cycle: cycle, amount: amount })
    (ok true)
  )
)

(define-public (process-late-payment (membership-id uint) (cycle uint) (amount uint))
  (let
    (
      (membership (unwrap! (contract-call? .MembershipNFT get-membership membership-id) (err ERR-MEMBERSHIP-NOT-FOUND)))
      (authority (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY)))
      (validity-period (get validity-period membership))
      (mint-timestamp (get mint-timestamp membership))
      (cycle-end (+ mint-timestamp (* cycle validity-period)))
      (penalty-amount (/ (* amount (var-get penalty-rate)) u100))
      (total-amount (+ amount penalty-amount))
    )
    (try! (validate-membership membership-id tx-sender))
    (try! (validate-amount amount))
    (asserts! (> block-height cycle-end) (err ERR-INVALID-TIMESTAMP))
    (asserts! (is-none (map-get? payment-records { membership-id: membership-id, cycle: cycle })) (err ERR-PAYMENT-ALREADY-PROCESSED))
    (try! (stx-transfer? total-amount tx-sender authority))
    (map-set payment-records { membership-id: membership-id, cycle: cycle } { amount: total-amount, timestamp: block-height, user: tx-sender })
    (try! (contract-call? .MembershipNFT update-validity membership-id (+ validity-period (* cycle validity-period))))
    (print { event: "late-payment-processed", membership-id: membership-id, cycle: cycle, amount: total-amount })
    (ok true)
  )
)