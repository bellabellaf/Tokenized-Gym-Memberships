(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-MEMBERSHIP-NOT-FOUND u101)
(define-constant ERR-INVALID-GYM-ID u102)
(define-constant ERR-INVALID-MEMBERSHIP u103)
(define-constant ERR-MEMBERSHIP-INACTIVE u104)
(define-constant ERR-GYM-NOT-REGISTERED u105)
(define-constant ERR-INVALID-AUTHORITY u106)
(define-constant ERR-ACCESS-ALREADY-LOGGED u107)
(define-constant ERR-INVALID-TIMESTAMP u108)
(define-constant ERR-MAX-ACCESS-LIMIT u109)
(define-constant ERR-INVALID-MAX-ACCESS u110)

(define-data-var authority-contract (optional principal) none)
(define-data-var membership-nft-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var max-access-per-membership uint u30)

(define-map gym-access-logs
  { membership-id: uint, gym-id: uint }
  { timestamp: uint, user: principal, access-count: uint }
)

(define-map gym-registry
  uint
  { name: (string-utf8 100), is-active: bool, max-access: uint }
)

(define-read-only (get-access-log (membership-id uint) (gym-id uint))
  (map-get? gym-access-logs { membership-id: membership-id, gym-id: gym-id })
)

(define-read-only (get-gym (gym-id uint))
  (map-get? gym-registry gym-id)
)

(define-read-only (get-max-access-limit)
  (var-get max-access-per-membership)
)

(define-private (validate-gym-id (gym-id uint))
  (is-some (map-get? gym-registry gym-id))
)

(define-private (validate-membership (membership-id uint) (user principal))
  (let
    (
      (membership (unwrap! (contract-call? .MembershipNFT get-membership membership-id) (err ERR-MEMBERSHIP-NOT-FOUND)))
    )
    (if (and (is-eq (get owner membership) user) (get is-active membership))
      (ok true)
      (err ERR-INVALID-MEMBERSHIP))
  )
)

(define-private (validate-max-access (max-access uint))
  (if (> max-access u0)
    (ok true)
    (err ERR-INVALID-MAX-ACCESS))
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

(define-public (set-max-access-limit (new-limit uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (try! (validate-max-access new-limit))
    (var-set max-access-per-membership new-limit)
    (ok true)
  )
)

(define-public (register-gym (gym-id uint) (name (string-utf8 100)) (max-access uint))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (asserts! (> (len name) u0) (err ERR-INVALID-GYM-ID))
    (asserts! (is-none (map-get? gym-registry gym-id)) (err ERR-GYM-NOT-REGISTERED))
    (try! (validate-max-access max-access))
    (map-set gym-registry gym-id { name: name, is-active: true, max-access: max-access })
    (print { event: "gym-registered", gym-id: gym-id, name: name })
    (ok true)
  )
)

(define-public (verify-membership (membership-id uint) (gym-id uint) (user principal))
  (begin
    (asserts! (validate-gym-id gym-id) (err ERR-GYM-NOT-REGISTERED))
    (asserts! (is-eq (get is-active (unwrap! (map-get? gym-registry gym-id) (err ERR-GYM-NOT-REGISTERED))) true) (err ERR-GYM-NOT-REGISTERED))
    (try! (validate-membership membership-id user))
    (let
      (
        (log (get-access-log membership-id gym-id))
        (gym (unwrap! (map-get? gym-registry gym-id) (err ERR-GYM-NOT-REGISTERED)))
        (access-count (default-to u0 (get access-count log)))
      )
      (asserts! (< access-count (get max-access gym)) (err ERR-MAX-ACCESS-LIMIT))
      (map-set gym-access-logs { membership-id: membership-id, gym-id: gym-id }
        { timestamp: block-height, user: user, access-count: (+ access-count u1) }
      )
      (print { event: "access-granted", membership-id: membership-id, gym-id: gym-id, user: user })
      (ok true)
    )
  )
)

(define-public (toggle-gym-status (gym-id uint) (is-active bool))
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY))) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-gym-id gym-id) (err ERR-GYM-NOT-REGISTERED))
    (map-set gym-registry gym-id
      (merge (unwrap! (map-get? gym-registry gym-id) (err ERR-GYM-NOT-REGISTERED)) { is-active: is-active })
    )
    (print { event: "gym-status-toggled", gym-id: gym-id, is-active: is-active })
    (ok true)
  )
)