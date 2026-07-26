import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Users, Search, UserPlus, UserCheck, X, Trash2, Loader2, AlertCircle, Clock } from "lucide-react"
import { toast } from "sonner"

import { Layout } from "@/components/layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { FadeIn } from "@/components/ui/fade-in"
import {
  useSearchUsers,
  useFriends,
  useFriendRequests,
  useSendFriendRequest,
  useAcceptFriendRequest,
  useRejectFriendRequest,
  useRemoveFriend,
} from "@/services/hooks"
import type { FriendRequest, FriendshipData } from "@/services/types"

/* ---------- Debounce Hook ---------- */

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/* ---------- User Avatar ---------- */

function UserAvatar({
  name,
  avatar_url,
  size = "md",
}: {
  name: string | null
  avatar_url?: string | null
  size?: "sm" | "md"
}) {
  const sizeClasses = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
  if (avatar_url) {
    return (
      <img
        src={avatar_url}
        alt={name || "User"}
        className={`${sizeClasses} rounded-full object-cover`}
      />
    )
  }
  return (
    <div
      className={`${sizeClasses} flex items-center justify-center rounded-full bg-primary/10 font-semibold text-primary`}
    >
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  )
}

/* ---------- Search Section ---------- */

function SearchSection() {
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounce(query, 300)
  const { data: results = [], isLoading } = useSearchUsers(debouncedQuery)
  const sendRequest = useSendFriendRequest()
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())

  const handleSend = useCallback(
    async (userId: string) => {
      try {
        await sendRequest.mutateAsync({ receiver_id: userId })
        setSentIds((prev) => new Set(prev).add(userId))
        toast.success("Friend request sent")
      } catch {
        toast.error("Failed to send request")
      }
    },
    [sendRequest]
  )

  return (
    <FadeIn delay={0.05}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Search Friends</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search users"
            className="flex h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {debouncedQuery.trim().length >= 2 && (
          <div className="space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm font-medium text-muted-foreground">No users found</p>
                <p className="text-xs text-muted-foreground/60">Try a different search term</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {results.map((user, i) => (
                  <FadeIn key={user.id} delay={0.03 * Math.min(i, 5)}>
                    <Card>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar name={user.display_name} avatar_url={user.avatar_url} />
                            <span className="text-sm font-medium truncate">{user.display_name || "User"}</span>
                          </div>
                          <Button
                            size="sm"
                            variant={sentIds.has(user.id) ? "secondary" : "default"}
                            disabled={sentIds.has(user.id) || sendRequest.isPending}
                            onClick={() => handleSend(user.id)}
                            aria-label={sentIds.has(user.id) ? "Request sent" : `Add ${user.display_name || "user"}`}
                            className="shrink-0 gap-1.5"
                          >
                            {sentIds.has(user.id) ? (
                              <>
                                <Clock className="h-3.5 w-3.5" />
                                Request Sent
                              </>
                            ) : (
                              <>
                                <UserPlus className="h-3.5 w-3.5" />
                                Add Friend
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </FadeIn>
                ))}
              </AnimatePresence>
            )}
          </div>
        )}
      </div>
    </FadeIn>
  )
}

/* ---------- Pending Requests Section ---------- */

function PendingRequestsSection() {
  const { data, isLoading } = useFriendRequests()
  const acceptRequest = useAcceptFriendRequest()
  const rejectRequest = useRejectFriendRequest()

  const requests = data?.received ?? []

  const handleAccept = async (req: FriendRequest) => {
    try {
      await acceptRequest.mutateAsync(req.id)
      toast.success(`You are now friends with ${req.sender.name || "User"}`)
    } catch {
      toast.error("Failed to accept request")
    }
  }

  const handleReject = async (req: FriendRequest) => {
    try {
      await rejectRequest.mutateAsync(req.id)
      toast.success("Request rejected")
    } catch {
      toast.error("Failed to reject request")
    }
  }

  return (
    <FadeIn delay={0.1}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Pending Requests</h2>
          {requests.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
              {requests.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm font-medium text-muted-foreground">No pending requests</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {requests.map((req, i) => (
              <FadeIn key={req.id} delay={0.03 * Math.min(i, 5)}>
                <Card>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <UserAvatar name={req.sender.name} avatar_url={req.sender.avatar_url} />
                        <span className="text-sm font-medium truncate">{req.sender.name || "User"}</span>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleAccept(req)}
                          disabled={acceptRequest.isPending}
                          aria-label={`Accept request from ${req.sender.name || "User"}`}
                          className="gap-1"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(req)}
                          disabled={rejectRequest.isPending}
                          aria-label={`Reject request from ${req.sender.name || "User"}`}
                          className="gap-1"
                        >
                          <X className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </FadeIn>
            ))}
          </AnimatePresence>
        )}
      </div>
    </FadeIn>
  )
}

/* ---------- Remove Friend Confirmation ---------- */

function RemoveFriendConfirm({
  open,
  onClose,
  onConfirm,
  deleting,
  friendName,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  deleting: boolean
  friendName: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-background border shadow-xl p-6 text-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-friend-modal-title"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <AlertCircle className="h-6 w-6 text-red-500" />
        </div>
        <h3 id="remove-friend-modal-title" className="text-lg font-semibold mb-1">Remove "{friendName}"?</h3>
        <p className="text-sm text-muted-foreground mb-6">You will no longer be friends. You can send a new request later.</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={deleting} className="flex-1 gap-1.5">
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Remove
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

/* ---------- My Friends Section ---------- */

function MyFriendsSection() {
  const { data: friends = [], isLoading } = useFriends()
  const removeFriend = useRemoveFriend()
  const [removingFriend, setRemovingFriend] = useState<FriendshipData | null>(null)

  const handleRemove = async () => {
    if (!removingFriend) return
    try {
      await removeFriend.mutateAsync(removingFriend.friend.id)
      toast.success("Friend removed")
      setRemovingFriend(null)
    } catch {
      toast.error("Failed to remove friend")
    }
  }

  return (
    <FadeIn delay={0.15}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">My Friends</h2>
          {friends.length > 0 && (
            <span className="text-xs text-muted-foreground">({friends.length})</span>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">No friends yet</p>
            <p className="text-xs text-muted-foreground/60">Search for users above to add friends.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-2">
              {friends.map((fs, i) => (
                <FadeIn key={fs.friend.id} delay={0.03 * Math.min(i, 5)}>
                  <motion.div layout>
                    <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar name={fs.friend.name} avatar_url={fs.friend.avatar_url} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{fs.friend.name || "User"}</p>
                              <p className="text-[11px] text-muted-foreground">Friends since {new Date(fs.since).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setRemovingFriend(fs)}
                            aria-label={`Remove ${fs.friend.name || "User"} as friend`}
                            className="h-9 px-2 rounded-md text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0 md:opacity-0 md:group-hover:opacity-100 opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </FadeIn>
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {removingFriend && (
          <RemoveFriendConfirm
            open
            onClose={() => setRemovingFriend(null)}
            onConfirm={handleRemove}
            deleting={removeFriend.isPending}
            friendName={removingFriend.friend.name || "User"}
          />
        )}
      </AnimatePresence>
    </FadeIn>
  )
}

/* ---------- Main Page ---------- */

export function FriendsPage() {
  return (
    <Layout>
      <div className="space-y-6 pb-8">
        <FadeIn>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Friends</h1>
              <p className="text-sm text-muted-foreground">Connect with other students</p>
            </div>
          </div>
        </FadeIn>

        <SearchSection />

        <div className="h-px bg-border" />

        <PendingRequestsSection />

        <div className="h-px bg-border" />

        <MyFriendsSection />
      </div>
    </Layout>
  )
}
