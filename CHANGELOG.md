# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Redesigned the extension popup for streamlined product management and order workflows.
- Applied the product grid layout across supported shop pages and improved its behavior on the target shop page.

## [1.1.0] - 2026-09-12

### Added

- Added order lookup after human-verification, with search by product name or order number, payment-status filtering, and pagination.
- Added secure card-code retrieval for completed orders, including masked values, individual and bulk reveal controls, and clipboard copying.
- Added automatic filling of empty contact and security-password fields in order confirmation dialogs.
- Added a session-backed service worker for order-verification tickets and passwords that are not explicitly saved on the device.
- Added a packaging script that validates the extension and creates a Chrome Web Store upload archive.

### Changed

- Updated the popup configuration experience with clearer feedback for saved order settings and password persistence.
- Raised the extension version from `1.0.3` to `1.1.0`.

## [1.0.3] - 2026-09-11

### Added

- Initial release of the Manifest V3 Chrome extension for WZYP shop pages.
- Added product sorting by price or site order and optional hiding of sold-out products.
- Added local storage for product preferences, order contact details, and optional password persistence.

[Unreleased]: https://github.com/lubezhang/chrome-plugin-ldxp/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/lubezhang/chrome-plugin-ldxp/compare/v1.0.3...v1.1.0
[1.0.3]: https://github.com/lubezhang/chrome-plugin-ldxp/releases/tag/v1.0.3
