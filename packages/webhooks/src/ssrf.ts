// SSRF guard for webhook targets. Loopback and private networks are allowed (that is
// where a developer's app runs); cloud metadata, link-local and multicast are not.
// The check runs inside the DNS lookup used for the connection, so a name cannot
// pass validation and then resolve to a blocked address.
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
blocked.addSubnet('0.0.0.0', 8, 'ipv4'); // "this network"
blocked.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local, incl. 169.254.169.254 metadata
blocked.addSubnet('224.0.0.0', 4, 'ipv4'); // multicast
blocked.addSubnet('240.0.0.0', 4, 'ipv4'); // reserved + broadcast
blocked.addAddress('100.100.100.200', 'ipv4'); // Alibaba Cloud metadata
blocked.addAddress('::', 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6'); // link-local
blocked.addSubnet('ff00::', 8, 'ipv6'); // multicast
blocked.addAddress('fd00:ec2::254', 'ipv6'); // AWS metadata over IPv6

export const BLOCKED_HOSTNAMES = new Set(['metadata', 'metadata.google.internal', 'metadata.goog', 'instance-data', 'instance-data.ec2.internal']);

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (mapped) return blocked.check(mapped, 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

export class BlockedTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedTargetError';
  }
}

/** Static checks on a configured target URL. Address checks happen at connect time. */
export function validateTargetUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedTargetError(`invalid webhook URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedTargetError(`webhook URL must be http(s): ${raw}`);
  if (url.username || url.password) throw new BlockedTargetError('webhook URL must not contain credentials');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) throw new BlockedTargetError(`webhook host ${host} is a cloud metadata service`);
  if (isIP(host) && isBlockedAddress(host)) throw new BlockedTargetError(`webhook address ${host} is blocked (link-local, metadata or multicast)`);
  return url;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A dns.lookup replacement for http.request that refuses blocked addresses. */
export function guardedLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
    callback(new BlockedTargetError(`webhook host ${hostname} is a cloud metadata service`), '');
    return;
  }
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, '');
    const bad = addresses.find((a) => isBlockedAddress(a.address));
    if (bad) return callback(new BlockedTargetError(`${hostname} resolves to blocked address ${bad.address}`), '');
    if (options.all) return callback(null, addresses);
    const first = addresses[0];
    if (!first) return callback(new BlockedTargetError(`${hostname} did not resolve`), '');
    callback(null, first.address, first.family);
  });
}
