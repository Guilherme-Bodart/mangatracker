"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, User } from "lucide-react";
import { apiRequest, getApiErrorMessage } from "@/lib/api-client";

interface RankedProfile {
  rank: number;
  username: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  likes: number;
  completed: number;
  reading: number;
}

export default function RankingPage() {
  const t = useTranslations("Ranking");
  const [profiles, setProfiles] = useState<RankedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        const data = await apiRequest<{ ranking: RankedProfile[] }>(
          "/manga/ranking/profiles?limit=100",
        );
        setProfiles(data.ranking);
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, "Failed to load ranking"));
      } finally {
        setIsLoading(false);
      }
    };

    void fetchRanking();
  }, []);

  return (
    <div className="px-4 py-10">
      <div className="container mx-auto px-0">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>

        {isLoading && (
          <div className="text-muted-foreground">{t("loading")}</div>
        )}

        {!isLoading && error && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("error")}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && profiles.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("empty")}
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && profiles.length > 0 && (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <Card
                key={profile.username}
                className="relative gap-3 overflow-hidden border-border/70 bg-card p-8 md:min-h-[240px] md:justify-between"
              >
                {profile.bannerUrl && (
                  <img
                    src={profile.bannerUrl}
                    alt={`${profile.username} banner`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                {profile.bannerUrl ? (
                  <div className="absolute inset-0 bg-white/52 dark:bg-slate-950/70" />
                ) : (
                  <div className="absolute inset-0 bg-card" />
                )}
                <CardHeader className="relative p-0 pb-3">
                  <CardTitle className="flex items-start justify-between gap-3 sm:items-center">
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge variant="secondary" className="text-sm">
                        #{profile.rank}
                      </Badge>
                      <Avatar className="size-16">
                        <AvatarImage src={profile.avatarUrl ?? undefined} />
                        <AvatarFallback>
                          <User className="size-7" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <Link
                          href={`/user/${profile.username}`}
                          prefetch={false}
                          className="block truncate text-2xl font-semibold text-foreground hover:underline"
                        >
                          @{profile.username}
                        </Link>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-lg text-red-500">
                      <Heart className="size-5 fill-current" />
                      <span className="font-semibold">{profile.likes}</span>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative p-0">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-lg md:grid-cols-3">
                  <div>
                    <span className="font-medium text-foreground dark:text-muted-foreground">
                      {t("likes")}:
                    </span>{" "}
                    <strong className="text-xl">{profile.likes}</strong>
                  </div>
                  <div>
                    <span className="font-medium text-foreground dark:text-muted-foreground">
                      {t("completed")}:
                    </span>{" "}
                    <strong className="text-xl">{profile.completed}</strong>
                  </div>
                  <div>
                    <span className="font-medium text-foreground dark:text-muted-foreground">
                      {t("reading")}:
                    </span>{" "}
                    <strong className="text-xl">{profile.reading}</strong>
                  </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
