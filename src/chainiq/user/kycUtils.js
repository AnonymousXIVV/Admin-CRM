/**
 * Canonical KYC status helpers - API uses Title Case (e.g. "Approved", "Under Review").
 * Use these everywhere instead of ad-hoc string comparisons.
 */

export const KYC_STATUS = Object.freeze({
  NOT_SUBMITTED: 'Not Submitted',
  UNDER_REVIEW: 'Under Review',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  FAILED: 'Failed',
});

export function getKycStatus(userOrStatus) {
  if (userOrStatus && typeof userOrStatus === 'object') {
    return userOrStatus.kycStatus || userOrStatus.kyc_status || KYC_STATUS.NOT_SUBMITTED;
  }
  return userOrStatus || KYC_STATUS.NOT_SUBMITTED;
}

export function isKycApproved(userOrStatus) {
  const s = String(getKycStatus(
    typeof userOrStatus === 'object' ? userOrStatus : { kycStatus: userOrStatus }
  )).toLowerCase().trim();
  return s === 'approved' || s === 'verified';
}

/** @deprecated Use isKycApproved - kept for existing imports from Modals */
export const isKycVerified = isKycApproved;

export function getKycBadgeClass(status) {
  if (isKycApproved(status)) return 'active';
  const s = String(status || '').toLowerCase().trim();
  if (s === 'under review' || s === 'pending') return 'pending';
  return 'inactive';
}

export function isKycUnderReview(status) {
  const s = String(status || '').toLowerCase().trim();
  return s === 'under review' || s === 'pending';
}

export function isKycFailed(status) {
  const s = String(status || '').toLowerCase().trim();
  return s === 'failed' || s === 'rejected';
}
