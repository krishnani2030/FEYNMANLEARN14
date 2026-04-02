import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RatingStars } from "@/components/rating-stars"
import { Users, Calendar } from "lucide-react"
import Link from "next/link"

// Mock data for user's groups
const myGroups = [
  {
    id: 1,
    name: "Calculus Study Group",
    subject: "Mathematics",
    members: 5,
    maxMembers: 6,
    nextSession: "Tomorrow, 3:00 PM",
    rating: 4.5,
  },
  {
    id: 2,
    name: "Organic Chemistry Basics",
    subject: "Chemistry",
    members: 4,
    maxMembers: 5,
    nextSession: "Friday, 2:00 PM",
    rating: 4.8,
  },
]

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">My Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here are your active study groups.</p>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 mb-12">
          <Card className="p-6 bg-primary/5 border-primary/20">
            <h3 className="text-lg font-semibold text-foreground mb-2">Find New Groups</h3>
            <p className="text-sm text-muted-foreground mb-4">Discover study groups that match your learning goals</p>
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Link href="/find-groups">Browse Groups</Link>
            </Button>
          </Card>

          <Card className="p-6 bg-accent/5 border-accent/20">
            <h3 className="text-lg font-semibold text-foreground mb-2">Create a Group</h3>
            <p className="text-sm text-muted-foreground mb-4">Start your own study group and invite others</p>
            <Button asChild variant="outline" className="border-accent text-accent hover:bg-accent/10 bg-transparent">
              <Link href="/find-groups">Create Group</Link>
            </Button>
          </Card>
        </div>

        {/* My Groups Section */}
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-6">My Groups</h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {myGroups.map((group) => (
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

                <div className="space-y-3 mb-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>
                      {group.members}/{group.maxMembers} members
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>{group.nextSession}</span>
                  </div>
                </div>

                <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                  <Link href={`/groups/${group.id}`}>View Details</Link>
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
