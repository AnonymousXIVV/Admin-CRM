/**
 * Convert the supported deposit-address response shapes into one canonical
 * client-side representation.
 *
 * The current API returns per-network buckets, while older deployments may
 * still return only a flat addresses array. Keeping that compatibility at one
 * boundary prevents the modal from having multiple selectors and fallbacks.
 */
export function normalizeDepositNetworks({ networks, addresses, network } = {}) {
    const buckets = new Map();

    const addBucket = (networkName, rawAddresses) => {
        if (!Array.isArray(rawAddresses)) return;
        const cleanAddresses = rawAddresses
            .map(address => String(address ?? '').trim())
            .filter(Boolean);
        if (cleanAddresses.length === 0) return;

        const normalizedNetwork = networkName == null ? '' : String(networkName).trim();
        const key = normalizedNetwork === ''
            ? '__default__'
            : normalizedNetwork.toLowerCase();
        const existing = buckets.get(key) || {
            network: key === '__default__' ? null : normalizedNetwork,
            addresses: [],
        };
        if (existing.network == null && normalizedNetwork !== '') existing.network = normalizedNetwork;
        cleanAddresses.forEach(address => {
            if (!existing.addresses.includes(address) && existing.addresses.length < 3) {
                existing.addresses.push(address);
            }
        });
        if (existing.addresses.length > 0) buckets.set(key, existing);
    };

    if (Array.isArray(networks)) {
        networks.forEach(entry => addBucket(entry?.network, entry?.addresses));
    }
    if (buckets.size === 0) {
        addBucket(network ?? null, addresses);
    }

    return Array.from(buckets.values());
}
