(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-DATA-ID u201)
(define-constant ERR-DATA-NOT-FOUND u202)
(define-constant ERR-NFT-ALREADY-MINTED u203)
(define-constant ERR-INVALID-ROYALTY-RATE u204)
(define-constant ERR-INVALID-METADATA-URI u205)
(define-constant ERR-TRANSFER-FAILED u206)
(define-constant ERR-INVALID-OWNER u207)
(define-constant ERR-MAX-NFTS-EXCEEDED u208)
(define-constant ERR-INVALID-STATUS u209)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u210)

(define-data-var next-nft-id uint u0)
(define-data-var max-nfts uint u5000)
(define-data-var mint-fee uint u1000)
(define-data-var authority-contract (optional principal) none)

(define-non-fungible-token genomic-nft uint)

(define-map nft-metadata
  uint
  {
    data-id: uint,
    owner: principal,
    royalty-rate: uint,
    metadata-uri: (string-ascii 256),
    timestamp: uint,
    status: bool
  }
)

(define-map nfts-by-data
  uint
  uint
)

(define-read-only (get-nft (id uint))
  (nft-get-owner? genomic-nft id)
)

(define-read-only (get-nft-details (id uint))
  (map-get? nft-metadata id)
)

(define-read-only (get-nft-by-data (data-id uint))
  (map-get? nfts-by-data data-id)
)

(define-read-only (is-nft-minted (data-id uint))
  (is-some (map-get? nfts-by-data data-id))
)

(define-private (validate-royalty-rate (rate uint))
  (if (<= rate u20)
      (ok true)
      (err ERR-INVALID-ROYALTY-RATE))
)

(define-private (validate-metadata-uri (uri (string-ascii 256)))
  (if (and (> (len uri) u0) (<= (len uri) u256))
      (ok true)
      (err ERR-INVALID-METADATA-URI))
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

(define-public (set-max-nfts (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-NFTS-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-nfts new-max)
    (ok true)
  )
)

(define-public (set-mint-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-STATUS))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set mint-fee new-fee)
    (ok true)
  )
)

(define-public (mint-nft
  (data-id uint)
  (royalty-rate uint)
  (metadata-uri (string-ascii 256))
)
  (let (
        (next-id (var-get next-nft-id))
        (current-max (var-get max-nfts))
        (authority (var-get authority-contract))
        (data-entry (contract-call? .DataStorage get-data data-id))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-NFTS-EXCEEDED))
    (try! (validate-royalty-rate royalty-rate))
    (try! (validate-metadata-uri metadata-uri))
    (match data-entry
      d
        (begin
          (asserts! (is-eq (get owner d) tx-sender) (err ERR-NOT-AUTHORIZED))
          (asserts! (not (is-nft-minted data-id)) (err ERR-NFT-ALREADY-MINTED))
          (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
            (try! (stx-transfer? (var-get mint-fee) tx-sender authority-recipient))
          )
          (try! (nft-mint? genomic-nft next-id tx-sender))
          (map-set nft-metadata next-id
            {
              data-id: data-id,
              owner: tx-sender,
              royalty-rate: royalty-rate,
              metadata-uri: metadata-uri,
              timestamp: block-height,
              status: true
            }
          )
          (map-set nfts-by-data data-id next-id)
          (var-set next-nft-id (+ next-id u1))
          (print { event: "nft-minted", id: next-id, data-id: data-id })
          (ok next-id)
        )
      (err ERR-DATA-NOT-FOUND)
    )
  )
)

(define-public (transfer-nft (nft-id uint) (recipient principal))
  (let ((details (map-get? nft-metadata nft-id)))
    (match details
      d
        (begin
          (asserts! (is-eq (get owner d) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (nft-transfer? genomic-nft nft-id tx-sender recipient))
          (map-set nft-metadata nft-id
            (merge d { owner: recipient })
          )
          (print { event: "nft-transferred", id: nft-id, to: recipient })
          (ok true)
        )
      (err ERR-DATA-NOT-FOUND)
    )
  )
)

(define-public (get-nft-count)
  (ok (var-get next-nft-id))
)