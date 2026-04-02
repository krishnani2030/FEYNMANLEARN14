"use client"

import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { RatingStars } from "@/components/rating-stars"
import { EmptyState } from "@/components/empty-state"
import { Users, Search, Plus, Calendar, Clock, Video } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

const allGroups = [
  {
    id: 3,
    name: "Physics Problem Solving",
    subject: "Physics",
    description: "Weekly sessions focused on solving challenging physics problems together.",
    members: 4,
    maxMembers: 6,
    rating: 4.7,
    date: "2025-11-01",
    time: "14:00",
    meetLink: "https://meet.google.com/abc-defg-hij",
  },
  {
    id: 4,
    name: "Data Structures & Algorithms",
    subject: "Computer Science",
    description: "Prepare for coding interviews by teaching each other key concepts.",
    members: 5,
    maxMembers: 6,
    rating: 4.9,
    date: "2025-10-28",
    time: "16:30",
    meetLink: "https://meet.google.com/xyz-abcd-efg",
  },
  {
    id: 5,
    name: "Spanish Conversation Practice",
    subject: "Languages",
    description: "Practice speaking Spanish in a supportive, beginner-friendly environment.",
    members: 3,
    maxMembers: 5,
    rating: 4.6,
    date: "2025-10-30",
    time: "18:00",
    meetLink: "https://meet.google.com/lmn-opqr-stu",
  },
  {
    id: 6,
    name: "Biology Study Sessions",
    subject: "Biology",
    description: "Cover cell biology, genetics, and evolution through peer teaching.",
    members: 6,
    maxMembers: 6,
    rating: 4.8,
    date: "2025-10-29",
    time: "15:00",
    meetLink: "https://meet.google.com/vwx-yzab-cde",
  },
]

export default function FindGroupsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [showCreateModal, setShowCreateModal] = useState(false)

  const filteredGroups = allGroups.filter(
    (group) =>
      group.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      group.description.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const formatTime = (timeString: string) => {
    const [hours, minutes] = timeString.split(":")
    const hour = Number.parseInt(hours)
    const ampm = hour >= 12 ? "PM" : "AM"
    const displayHour = hour % 12 || 12
    return `${displayHour}:${minutes} ${ampm}`
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">Find Study Groups</h1>
              <p className="text-muted-foreground">Discover groups that match your learning interests</p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Group
            </Button>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by subject, topic, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Groups Grid */}
        {filteredGroups.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredGroups.map((group) => (
              <Card key={group.id} className="p-6 bg-card border-border hover:shadow-lg transition-shadow">
                <div className="mb-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-xl font-semibold text-card-foreground text-balance">{group.name}</h3>
                    <Badge variant="secondary" className="bg-secondary/10 text-secondary">
                      {group.subject}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mb-3">
                    <RatingStars rating={group.rating} />
                    <span className="text-sm text-muted-foreground ml-1">({group.rating})</span>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-4 text-pretty">{group.description}</p>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(group.date)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatTime(group.time)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Video className="h-4 w-4" />
                    <span className="truncate">Google Meet</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 pt-2 border-t border-border">
                  <Users className="h-4 w-4" />
                  <span>
                    {group.members}/{group.maxMembers} members
                  </span>
                  {group.members === group.maxMembers && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      Full
                    </Badge>
                  )}
                </div>

                <Button
                  asChild
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={group.members === group.maxMembers}
                >
                  <Link href={`/groups/${group.id}`}>View Details</Link>
                </Button>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Search}
            title="No groups found"
            description="Try adjusting your search or create a new group to get started."
          />
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md p-6 bg-card border-border">
            <h2 className="text-2xl font-bold text-foreground mb-4">Create Study Group</h2>

            <form className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="group-name" className="text-sm font-medium text-foreground">
                  Group Name
                </label>
                <Input id="group-name" type="text" placeholder="e.g., Calculus Study Group" required />
              </div>

              <div className="space-y-2">
                <label htmlFor="subject" className="text-sm font-medium text-foreground">
                  Subject
                </label>
                <Input id="subject" type="text" placeholder="e.g., Mathematics" required />
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium text-foreground">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  placeholder="Describe what your group will focus on..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="date" className="text-sm font-medium text-foreground">
                  Date
                </label>
                <Input id="date" type="date" required />
              </div>

              <div className="space-y-2">
                <label htmlFor="time" className="text-sm font-medium text-foreground">
                  Time
                </label>
                <Input id="time" type="time" required />
              </div>

              <div className="space-y-2">
                <label htmlFor="meet-link" className="text-sm font-medium text-foreground">
                  Google Meet Link
                </label>
                <Input id="meet-link" type="url" placeholder="https://meet.google.com/xxx-xxxx-xxx" required />
              </div>

              <div className="space-y-2">
                <label htmlFor="max-members" className="text-sm font-medium text-foreground">
                  Max Members
                </label>
                <Input id="max-members" type="number" min="2" max="10" defaultValue="6" required />
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  Create Group
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
