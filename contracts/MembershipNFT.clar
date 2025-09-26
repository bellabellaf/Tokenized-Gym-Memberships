(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-MEMBERSHIP-ID u101)
(define-constant ERR-INVALID-MINT-FEE u102)
(define-constant ERR-INVALID-VALIDITY-PERIOD u103)
(define-constant ERR-MEMBERSHIP-NOT-FOUND u104)
(define-constant ERR-ALREADY-MINTED u105)
(define-constant ERR-TRANSFER-NOT-ALLOWED u106)
(define-constant ERR-INVALID-RECIPIENT u107)
(define-constant ERR-INVALID-METADATA u108)
(define-constant ERR-MAX-MEMBERSHIPS-EXCEEDED u109)
(define-constant ERR-INVALID-AUTHORITY u110)
(define-constant ERR-INVALID-TIER u111)

(define-data-var next-membership-id uint u0)
(define-data-var max-memberships uint u10000)
(define-data-var mint-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-non-fungible-token membership-nft uint)

(define-map memberships
  uint
  {
    owner: principal,
    tier: (string-utf8 50),
    validity-period: uint,
    mint-timestamp: uint,
    metadata: (string-utf8 256),
    is-active: bool
  }
)

(define-map membership-by-owner
  principal
  (list 100 uint)
)

(define-read-only (get-membership (id uint))
  (map-get? memberships id)
)

(define-read-only (get-memberships-by-owner (owner principal))
  (default-to (list) (map-get? membership-by-owner owner))
)

(define-read-only (get-next-membership-id)
  (var-get next-membership-id)
)

(define-read-only (get-mint-fee)
  (var-get mint-fee)
)

(define-private (validate-tier (tier (string-utf8 50)))
  (if (or (is-eq tier u"basic") (is-eq tier u"premium") (is-eq tier u"elite"))
    (ok true)
    (err ERR-INVALID-TIER))
)

(define-private (validate-validity-period (period uint))
  (if (and (> period u0) (<= period u365))
    (ok true)
    (err ERR-INVALID-VALIDITY-PERIOD))
)

(define-private (validate-metadata (metadata (string-utf8 256)))
  (if (<= (len metadata) u256)
    (ok true)
    (err ERR-INVALID-METADATA))
)

(define-private (validate-recipient (recipient principal))
  (if (not (is-eq recipient 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-RECIPIENT))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (asserts! (is-none (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (try! (validate-recipient contract-principal))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-MINT-FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR-INVALID-AUTHORITY))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (mint-membership (recipient principal) (tier (string-utf8 50)) (validity-period uint) (metadata (string-utf8 256)))
  (let
    (
      (membership-id (var-get next-membership-id))
      (authority (unwrap! (var-get authority-contract) (err ERR-INVALID-AUTHORITY)))
    )
    (asserts! (< membership-id (var-get max-memberships)) (err ERR-MAX-MEMBERSHIPS-EXCEEDED))
    (try! (validate-tier tier))
    (try! (validate-validity-period validity-period))
    (try! (validate-recipient recipient))
    (try! (validate-metadata metadata))
    (try! (stx-transfer? (var-get mint-fee) tx-sender authority))
    (try! (nft-mint? membership-nft membership-id recipient))
    (map-set memberships membership-id
      {
        owner: recipient,
        tier: tier,
        validity-period: validity-period,
        mint-timestamp: block-height,
        metadata: metadata,
        is-active: true
      }
    )
    (map-set membership-by-owner recipient
      (unwrap! (as-max-len? (append (get-memberships-by-owner recipient) membership-id) u100) (err ERR-MAX-MEMBERSHIPS-EXCEEDED))
    )
    (var-set next-membership-id (+ membership-id u1))
    (print { event: "membership-minted", id: membership-id, recipient: recipient })
    (ok membership-id)
  )
)

(define-public (transfer-membership (membership-id uint) (recipient principal))
  (let
    (
      (membership (unwrap! (map-get? memberships membership-id) (err ERR-MEMBERSHIP-NOT-FOUND)))
      (current-owner (get owner membership))
    )
    (asserts! (is-eq tx-sender current-owner) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient recipient))
    (asserts! (get is-active membership) (err ERR-TRANSFER-NOT-ALLOWED))
    (try! (nft-transfer? membership-nft membership-id current-owner recipient))
    (map-set memberships membership-id
      (merge membership { owner: recipient })
    )
    (map-set membership-by-owner current-owner
      (filter (lambda (id) (not (is-eq id membership-id))) (get-memberships-by-owner current-owner))
    )
    (map-set membership-by-owner recipient
      (unwrap! (as-max-len? (append (get-memberships-by-owner recipient) membership-id) u100) (err ERR-MAX-MEMBERSHIPS-EXCEEDED))
    )
    (print { event: "membership-transferred", id: membership-id, from: current-owner, to: recipient })
    (ok true)
  )
)

(define-public (deactivate-membership (membership-id uint))
  (let
    (
      (membership (unwrap! (map-get? memberships membership-id) (err ERR-MEMBERSHIP-NOT-FOUND)))
      (current-owner (get owner membership))
    )
    (asserts! (is-eq tx-sender current-owner) (err ERR-NOT-AUTHORIZED))
    (asserts! (get is-active membership) (err ERR-TRANSFER-NOT-ALLOWED))
    (map-set memberships membership-id
      (merge membership { is-active: false })
    )
    (print { event: "membership-deactivated", id: membership-id })
    (ok true)
  )
)