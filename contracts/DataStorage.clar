(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-METADATA u102)
(define-constant ERR-INVALID-IPFS-LINK u103)
(define-constant ERR-DATA-ALREADY-EXISTS u104)
(define-constant ERR-DATA-NOT-FOUND u105)
(define-constant ERR-INVALID-TIMESTAMP u106)
(define-constant ERR-INVALID-SEQUENCE-TYPE u107)
(define-constant ERR-INVALID-OWNER u108)
(define-constant ERR-INVALID-ACCESS-FEE u109)
(define-constant ERR-TRANSFER-FAILED u110)
(define-constant ERR-INVALID-UPDATE-PARAM u111)
(define-constant ERR-UPDATE-NOT-ALLOWED u112)
(define-constant ERR-MAX-DATA-EXCEEDED u113)
(define-constant ERR-INVALID-STATUS u114)
(define-constant ERR-INVALID-VISIBILITY u115)
(define-constant ERR-INVALID-EXPIRY u116)
(define-constant ERR-INVALID-CATEGORY u117)
(define-constant ERR-INVALID-TAGS u118)
(define-constant ERR-INVALID-DESCRIPTION u119)
(define-constant ERR-AUTHORITY-NOT-VERIFIED u120)

(define-data-var next-data-id uint u0)
(define-data-var max-data-entries uint u10000)
(define-data-var registration-fee uint u500)
(define-data-var authority-contract (optional principal) none)

(define-map genomic-data
  uint
  {
    owner: principal,
    hash: (buff 32),
    ipfs-link: (optional (string-ascii 256)),
    metadata: (string-ascii 512),
    timestamp: uint,
    sequence-type: (string-ascii 50),
    status: bool,
    visibility: (string-ascii 20),
    expiry: uint,
    category: (string-ascii 50),
    tags: (list 10 (string-ascii 50)),
    description: (string-utf8 1024)
  }
)

(define-map data-by-hash
  (buff 32)
  uint
)

(define-map data-updates
  uint
  {
    update-metadata: (string-ascii 512),
    update-ipfs-link: (optional (string-ascii 256)),
    update-timestamp: uint,
    updater: principal
  }
)

(define-map access-logs
  uint
  (list 100 { accessor: principal, access-time: uint })
)

(define-read-only (get-data (id uint))
  (map-get? genomic-data id)
)

(define-read-only (get-data-updates (id uint))
  (map-get? data-updates id)
)

(define-read-only (get-access-logs (id uint))
  (map-get? access-logs id)
)

(define-read-only (is-data-registered (hash (buff 32)))
  (is-some (map-get? data-by-hash hash))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
      (ok true)
      (err ERR-INVALID-HASH))
)

(define-private (validate-metadata (meta (string-ascii 512)))
  (if (and (> (len meta) u0) (<= (len meta) u512))
      (ok true)
      (err ERR-INVALID-METADATA))
)

(define-private (validate-ipfs-link (link (optional (string-ascii 256))))
  (match link l
    (if (<= (len l) u256) (ok true) (err ERR-INVALID-IPFS-LINK))
    (ok true))
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
      (ok true)
      (err ERR-INVALID-TIMESTAMP))
)

(define-private (validate-sequence-type (stype (string-ascii 50)))
  (if (or (is-eq stype "whole-genome") (is-eq stype "exome") (is-eq stype "targeted"))
      (ok true)
      (err ERR-INVALID-SEQUENCE-TYPE))
)

(define-private (validate-visibility (vis (string-ascii 20)))
  (if (or (is-eq vis "public") (is-eq vis "private") (is-eq vis "restricted"))
      (ok true)
      (err ERR-INVALID-VISIBILITY))
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
      (ok true)
      (err ERR-INVALID-EXPIRY))
)

(define-private (validate-category (cat (string-ascii 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
      (ok true)
      (err ERR-INVALID-CATEGORY))
)

(define-private (validate-tags (tags (list 10 (string-ascii 50))))
  (if (<= (len tags) u10)
      (ok true)
      (err ERR-INVALID-TAGS))
)

(define-private (validate-description (desc (string-utf8 1024)))
  (if (<= (len desc) u1024)
      (ok true)
      (err ERR-INVALID-DESCRIPTION))
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

(define-public (set-max-data-entries (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR-MAX-DATA-EXCEEDED))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set max-data-entries new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR-INVALID-UPDATE-PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR-AUTHORITY-NOT-VERIFIED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-data
  (hash (buff 32))
  (ipfs-link (optional (string-ascii 256)))
  (metadata (string-ascii 512))
  (sequence-type (string-ascii 50))
  (visibility (string-ascii 20))
  (expiry uint)
  (category (string-ascii 50))
  (tags (list 10 (string-ascii 50)))
  (description (string-utf8 1024))
)
  (let (
        (next-id (var-get next-data-id))
        (current-max (var-get max-data-entries))
        (authority (var-get authority-contract))
      )
    (asserts! (< next-id current-max) (err ERR-MAX-DATA-EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-ipfs-link ipfs-link))
    (try! (validate-metadata metadata))
    (try! (validate-sequence-type sequence-type))
    (try! (validate-visibility visibility))
    (try! (validate-expiry expiry))
    (try! (validate-category category))
    (try! (validate-tags tags))
    (try! (validate-description description))
    (asserts! (is-none (map-get? data-by-hash hash)) (err ERR-DATA-ALREADY-EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR-AUTHORITY-NOT-VERIFIED))))
      (try! (stx-transfer? (var-get registration-fee) tx-sender authority-recipient))
    )
    (map-set genomic-data next-id
      {
        owner: tx-sender,
        hash: hash,
        ipfs-link: ipfs-link,
        metadata: metadata,
        timestamp: block-height,
        sequence-type: sequence-type,
        status: true,
        visibility: visibility,
        expiry: expiry,
        category: category,
        tags: tags,
        description: description
      }
    )
    (map-set data-by-hash hash next-id)
    (var-set next-data-id (+ next-id u1))
    (print { event: "data-registered", id: next-id })
    (ok next-id)
  )
)

(define-public (update-data
  (data-id uint)
  (update-metadata (string-ascii 512))
  (update-ipfs-link (optional (string-ascii 256)))
)
  (let ((data (map-get? genomic-data data-id)))
    (match data
      d
        (begin
          (asserts! (is-eq (get owner d) tx-sender) (err ERR-NOT-AUTHORIZED))
          (try! (validate-metadata update-metadata))
          (try! (validate-ipfs-link update-ipfs-link))
          (map-set genomic-data data-id
            {
              owner: (get owner d),
              hash: (get hash d),
              ipfs-link: update-ipfs-link,
              metadata: update-metadata,
              timestamp: block-height,
              sequence-type: (get sequence-type d),
              status: (get status d),
              visibility: (get visibility d),
              expiry: (get expiry d),
              category: (get category d),
              tags: (get tags d),
              description: (get description d)
            }
          )
          (map-set data-updates data-id
            {
              update-metadata: update-metadata,
              update-ipfs-link: update-ipfs-link,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "data-updated", id: data-id })
          (ok true)
        )
      (err ERR-DATA-NOT-FOUND)
    )
  )
)

(define-public (log-access (data-id uint))
  (let ((data (map-get? genomic-data data-id)))
    (match data
      d
        (begin
          (asserts! (not (is-eq (get visibility d) "private")) (err ERR-NOT-AUTHORIZED))
          (let ((current-logs (default-to (list) (map-get? access-logs data-id))))
            (map-set access-logs data-id (append current-logs { accessor: tx-sender, access-time: block-height }))
          )
          (ok true)
        )
      (err ERR-DATA-NOT-FOUND)
    )
  )
)

(define-public (get-data-count)
  (ok (var-get next-data-id))
)

(define-public (check-data-existence (hash (buff 32)))
  (ok (is-data-registered hash))
)