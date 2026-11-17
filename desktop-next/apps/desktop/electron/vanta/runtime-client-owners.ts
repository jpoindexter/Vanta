/** Native commands carry a chat ID, so only a live, unambiguous stream can supply its owner. */
export class RuntimeClientOwners {
  private readonly clients = new Map<string, Map<string, { count: number; lease: number }>>()
  private lease = 0

  bind(clientId: string, profile: string): () => void {
    const owners = this.clients.get(clientId) ?? new Map<string, { count: number; lease: number }>()
    this.clients.set(clientId, owners)
    const current = owners.get(profile) ?? { count: 0, lease: ++this.lease }
    current.count += 1
    owners.set(profile, current)
    let active = true
    return () => {
      if (!active) return
      active = false
      current.count -= 1
      if (current.count) owners.set(profile, current)
      else owners.delete(profile)
      if (!owners.size && this.clients.get(clientId) === owners) this.clients.delete(clientId)
    }
  }

  profile(clientId: string): string | undefined {
    const owners = this.clients.get(clientId)
    if (owners && owners.size > 1) throw new Error('This chat ID belongs to more than one profile. Select an unambiguous chat.')
    return owners?.keys().next().value
  }

  capture(clientId: string): { profile: string; lease: number } | undefined {
    const profile = this.profile(clientId)
    return profile ? { profile, lease: this.clients.get(clientId)!.get(profile)!.lease } : undefined
  }

  matches(clientId: string, profile: string, lease: number): boolean {
    const owners = this.clients.get(clientId)
    return owners?.size === 1 && owners.get(profile)?.lease === lease
  }

  clear(): void { this.clients.clear() }
}
