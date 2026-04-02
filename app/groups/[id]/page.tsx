"use client"

import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RatingStars } from "@/components/rating-stars"
import { Users, Calendar, Clock, Video, Star } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

// Mock data for group details
const groupData = {
  id: 1,
  name: "Calculus Study Group",
  subject: "Mathematics",
  description:
    "A collaborative group focused on mastering calculus concepts through peer teaching. We cover derivatives, integrals, limits, and real-world applications. Perfect for students taking Calc I or II.",
  rating: 4.5,
  members: 5,
  maxMembers: 6,
  date: "2025-01-15",
  time: "3:00 PM",
  meetLink: "https://meet.google.com/abc-defg-hij",
  organizer: {
    name: "Sarah Johnson",
    initials: "SJ",
  },
  membersList: [
    { name: "Sarah Johnson", initials: "SJ", role: "Organizer" },
    { name: "Mike Chen", initials: "MC", role: "Member" },
    { name: "Emily Davis", initials: "ED", role: "Member" },
    { name: "James Wilson", initials: "JW", role: "Member" },
    { name: "Lisa Brown", initials: "LB", role: "Member" },
  ],
}

export default function GroupDetailsPage() {
  const isFull = groupData.members === groupData.maxMembers
  const [isEnrolled, setIsEnrolled] = useState(true) // Mock: user is enrolled
  const [rating, setRating] = useState(0)
  const [feedback, setFeedback] = useState("")
  const [showFeedbackForm, setShowFeedbackForm] = useState(false)

  const handleSubmitFeedback = () => {
    console.log("[v0] Submitting feedback:", { rating, feedback })
    // Reset form
    setRating(0)
    setFeedback("")
    setShowFeedbackForm(false)
    // Show success message (in real app)
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Back Button */}
        <Button asChild variant="ghost" className="mb-6">
          <Link href="/find-groups">← Back to Groups</Link>
        </Button>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Group Header */}
            <Card className="p-6 bg-card border-border">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl font-bold text-foreground mb-2 text-balance">{groupData.name}</h1>
                  <Badge variant="secondary" className="bg-secondary/10 text-secondary">
                    {groupData.subject}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <RatingStars rating={groupData.rating} />
                  <span className="text-sm text-muted-foreground ml-1">({groupData.rating})</span>
                </div>
              </div>

              <p className="text-muted-foreground text-pretty leading-relaxed">{groupData.description}</p>
            </Card>

            {/* Group Details */}
            <Card className="p-6 bg-card border-border">
              <h2 className="text-xl font-semibold text-foreground mb-4">Group Details</h2>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Users className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Members</p>
                    <p className="text-sm text-muted-foreground">
                      {groupData.members} of {groupData.maxMembers} spots filled
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Date</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(groupData.date).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Time</p>
                    <p className="text-sm text-muted-foreground">{groupData.time}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Video className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground">Google Meet Link</p>
                    <a
                      href={groupData.meetLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {groupData.meetLink}
                    </a>
                  </div>
                </div>
              </div>
            </Card>

            {/* Members List */}
            <Card className="p-6 bg-card border-border">
              <h2 className="text-xl font-semibold text-foreground mb-4">Members</h2>

              <div className="space-y-3">
                {groupData.membersList.map((member, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 bg-primary/10">
                      <AvatarFallback className="text-primary font-medium">{member.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{member.name}</p>
                      <p className="text-sm text-muted-foreground">{member.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {isEnrolled && (
              <Card className="p-6 bg-card border-border">
                <h2 className="text-xl font-semibold text-foreground mb-4">Give Feedback</h2>

                {!showFeedbackForm ? (
                  <Button
                    onClick={() => setShowFeedbackForm(true)}
                    className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Rate This Group
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <Label className="text-foreground mb-2 block">Your Rating</Label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setRating(star)}
                            className="transition-colors hover:scale-110"
                          >
                            <Star
                              className={`h-8 w-8 ${
                                star <= rating ? "fill-primary text-primary" : "fill-none text-muted-foreground"
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="feedback" className="text-foreground mb-2 block">
                        Your Feedback (Optional)
                      </Label>
                      <Textarea
                        id="feedback"
                        placeholder="Share your experience with this study group..."
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="min-h-[100px] bg-background border-border text-foreground"
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button
                        onClick={handleSubmitFeedback}
                        disabled={rating === 0}
                        className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Submit Feedback
                      </Button>
                      <Button
                        onClick={() => {
                          setShowFeedbackForm(false)
                          setRating(0)
                          setFeedback("")
                        }}
                        variant="outline"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card className="p-6 bg-card border-border sticky top-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Join This Group</h3>

              {isFull ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground text-center">This group is currently full</p>
                  </div>
                  <Button disabled className="w-full">
                    Group Full
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <p className="text-sm text-foreground mb-1 font-medium">
                      {groupData.maxMembers - groupData.members} spot
                      {groupData.maxMembers - groupData.members !== 1 ? "s" : ""} remaining
                    </p>
                    <p className="text-xs text-muted-foreground">Join now to secure your place</p>
                  </div>
                  <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">Join Group</Button>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-border">
                <h4 className="text-sm font-semibold text-foreground mb-3">Organized by</h4>
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 bg-primary/10">
                    <AvatarFallback className="text-primary font-medium">{groupData.organizer.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">{groupData.organizer.name}</p>
                    <p className="text-sm text-muted-foreground">Group Organizer</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
