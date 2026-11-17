import { beforeEach, expect, it, vi } from 'vitest'

import { $groupChats } from '../bots/group-chat'
import { durableGroupChatMembers, groupMemberKey } from '../bots/group-membership'
import { parseGroupChatMentions, resolveGroupResponders, unaddressedGroupMentions } from '../bots/group-rounds'
import type { GroupMember, GroupMessage } from '../bots/types'

vi.mock('@vanta/plugin-sdk', async () => {
  const { atom } = await import('nanostores')

  return {
    atom,
    host: { request: vi.fn(), state: { connectionId: { get: () => 'local' }, profile: { get: () => 'default' } } },
    queryClient: { invalidateQueries: vi.fn() },
    useQuery: vi.fn(),
    useValue: vi.fn()
  }
})
vi.mock('../bots/shared', () => ({ getPluginCtx: () => null, ID: 'vanta-bots' }))

beforeEach(() => $groupChats.set({}))

it('keeps primary handoffs callable in both directions across persisted descriptor shapes', () => {
  for (const handle of [undefined, 'default', 'vanta']) {
    const original: GroupMember[] = [{ name: 'default', handle }, { name: 'code-farmer' }]

    const durable = durableGroupChatMembers(original)
    expect(durable.map(member => member.handle)).toEqual(['vanta', 'code-farmer'])

    for (const members of [original, durable]) {
      for (const [sender, target, senderTag, targetTag] of [
        ['code-farmer', 'default', 'code-farmer', 'vanta'],
        ['default', 'code-farmer', 'vanta', 'code-farmer']
      ]) {
        const targetKey = groupMemberKey(members.find(member => member.name === target)!)

        const log: GroupMessage[] = [
          { at: 1, from: { kind: 'user', name: 'You' }, id: 'u', text: `@${senderTag} begin`, thread: 't' },
          { at: 2, from: { kind: 'member', name: sender }, id: 'm', text: `@${targetTag} continue`, thread: 't' }
        ]

        $groupChats.set({ g: { log, members, roomId: 'room', watermarks: {} } })
        expect([...parseGroupChatMentions(log[1].text, members).mentioned]).toEqual([targetKey])
        expect(resolveGroupResponders(log, members).map(member => member.name)).toContain(target)
        expect(unaddressedGroupMentions('g', members, 't')).toEqual([targetKey])
      }
    }
  }
})

it('keeps qualified remote defaults distinct from the primary alias regardless of roster order', () => {
  const local: GroupMember = { name: 'default', handle: 'vanta', connectionId: 'local', sourceScoped: true }

  const remotes: GroupMember[] = ['vera', 'spark'].map(device => ({
    name: 'default',
    handle: `default-${device}`,
    connectionId: device,
    remoteSource: true,
    sourceScoped: true
  }))

  for (const members of [[local, ...remotes], [...remotes].reverse().concat(local)]) {
    for (const descriptors of [members, durableGroupChatMembers(members)]) {
      for (const [tag, key] of [
        ['vanta', 'local::default'],
        ['default-vera', 'vera::default'],
        ['default-spark', 'spark::default']
      ]) {
        expect([...parseGroupChatMentions(`@${tag} continue`, descriptors).mentioned]).toEqual([key])
      }
    }
  }
})
