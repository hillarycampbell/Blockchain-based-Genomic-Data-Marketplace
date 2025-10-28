(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INVALID-NFT-ID u301)
(define-constant ERR-NFT-NOT-FOUND u302)
(define-constant ERR-LISTING-EXISTS u303)
(define-constant ERR-INVALID-PRICE u304)
(define-constant ERR-INVALID-CURRENCY u305)
(define-constant ERR-TRANSFER-FAILED u306)
(define-constant ERR-LISTING-NOT-FOUND u307)
(define-constant ERR-INVALID-STATUS u308)
(define-constant ERR-INVALID-EXPIRY u309)
(define-constant ERR-MAX-LISTINGS-EXCEEDED u310)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u311)
(define-constant ERR-INVALID-DISCOUNT u312)
(define-constant ERR-INVALID-LISTING-TYPE u313)

(define-data-var next-listing-id uint u0)
(define-data-var max-listings uint u1000)
(define-data-var listing-fee uint u250)
(define-data-var authority-contract (optional principal) none)

(define-map listings
  uint
  {
    nft-id: uint,
    owner: principal,
    price: uint,
    currency: (string-ascii 20),
    listing-type: (string-ascii 20),
    expiry: uint,
    discount: uint,
    status: bool,
    timestamp: uint
  }
)

(define-map listings-by-nft
  uint
  uint
)

(define-map active-listings
  principal
  (list 100 uint)
)

(define-read-only (get-listing (id uint))
  (map-get? listings id)
)

(define-read-only (get-listing-by-nft (nft-id uint))
  (map-get? listings-by-nft nft-id)
)

(define-read-only (get-active-listings (owner principal))
  (map-get? active-listings owner)
)

(define-read-only (is-nft-listed (nft-id uint))
  (is-some (map-get? listings-by-nft nft-id))
)

(define-private (validate-price (price uint))
  (if (> price u0)
      (ok true)
      (err ERR-INVALID-PRICE))
)

(define-private (validate-currency (cur (string-ascii 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
      (ok true)
      (err ERR-INVALID-CURRENCY))
)

(define-private (validate-listing-type (ltype (string-ascii 20)))
  (if (or (is-eq ltype "fixed") (is-eq ltype "auction"))
      (ok true)
      (err ERR-INVALID-LISTING-TYPE))
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
      (ok true)
      (err ERR-INVALID-EXPIRY))
)

(define-private (validate-discount (disc uint))
  (if (<= disc u100)
      (ok true)
      (err ERR-INVALID-DISCOUNT))
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
      (ok true)
      (err ERR-NOT-AUTHORIZED))
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-listings (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-LISTINGS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-listings new-max)
    (ok true)
  )
)

(define-public (set-listing-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-STATUS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set listing-fee new-fee)
    (ok true)
  )
)

(define-public (create-listing
  (nft-id uint)
  (price uint)
  (currency (string-ascii 20))
  (listing-type (string-ascii 20))
  (expiry uint)
  (discount uint)
)
  (let (
        (next-id (var-get next-listing-id))
        (current-max (var-get max-listings))
        (authority (var-get authority-contract))
        (nft-owner (contract-call? .NFTMinter get-nft nft-id))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-LISTINGS-EXCEEDED))
    (try! (validate-price price))
    (try! (validate-currency currency))
    (try! (validate-listing-type listing-type))
    (try! (validate-expiry expiry))
    (try! (validate-discount discount))
    (match nft-owner
      owner
        (begin
          (asserts! (is-eq owner tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (is-nft-listed nft-id)) (err ERR-LISTING-EXISTS))
          (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
            (try! (stx-transfer? (var-get listing-fee) tx-sender authority-recipient))
          )
          (let ((current-active (default-to (list) (map-get? active-listings tx-sender))))
            (map-set active-listings tx-sender (append current-active next-id))
          )
          (map-set listings next-id
            {
              nft-id: nft-id,
              owner: tx-sender,
              price: price,
              currency: currency,
              listing-type: listing-type,
              expiry: expiry,
              discount: discount,
              status: true,
              timestamp: block-height
            }
          )
          (map-set listings-by-nft nft-id next-id)
          (var-set next-listing-id (+ next-id u1))
          (print { event: "listing-created", id: next-id, nft-id: nft-id })
          (ok next-id)
        )
      (err ERR-NFT-NOT-FOUND)
    )
  )
)

(define-public (cancel-listing (listing-id uint))
  (let ((listing (map-get? listings listing-id)))
    (match listing
      l
        (begin
          (asserts! (is-eq (get owner l) tx-sender) (err ERR-NOT-AUTHORIZED))
          (map-set listings listing-id
            (merge l { status: false })
          )
          (let ((active (default-to (list) (map-get? active-listings tx-sender))))
            (map-set active-listings tx-sender (filter (lambda (id) (not (is-eq id listing-id))) active))
          )
          (print { event: "listing-cancelled", id: listing-id })
          (ok true)
        )
      (err ERR-LISTING-NOT-FOUND)
    )
  )
)

(define-public (update-price (listing-id uint) (new-price uint))
  (let ((listing (map-get? listings listing-id)))
    (match listing
      l
        (begin
          (asserts! (is-eq (get owner l) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (get status l) (err ERR-INVALID-STATUS))
          (try! (validate-price new-price))
          (map-set listings listing-id
            (merge l { price: new-price })
          )
          (print { event: "price-updated", id: listing-id })
          (ok true)
        )
      (err ERR-LISTING-NOT-FOUND)
    )
  )
)

(define-public (get-listing-count)
  (ok (var-get next-listing-id))
)