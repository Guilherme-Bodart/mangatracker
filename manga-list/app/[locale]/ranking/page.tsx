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
    <div className="container mx-auto px-4 py-10">
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
            <Card key={profile.username} className="relative overflow-hidden">
              {profile.bannerUrl && (
                <img
                  src={profile.bannerUrl}
                  alt={`${profile.username} banner`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-slate-950/70" />
              <CardHeader className="relative pb-3">
                <CardTitle className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">#{profile.rank}</Badge>
                    <Avatar className="size-11">
                      <AvatarImage src={profile.avatarUrl ?? undefined} />
                      <AvatarFallback>
                        <User className="size-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Link
                        href={`/user/${profile.username}`}
                        prefetch={false}
                        className="font-semibold hover:underline"
                      >
                        @{profile.username}
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-red-500 text-sm">
                    <Heart className="size-4 fill-current" />
                    <span className="font-medium">{profile.likes}</span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="relative pt-0">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("likes")}:</span>{" "}
                    <strong>{profile.likes}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("completed")}:</span>{" "}
                    <strong>{profile.completed}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("reading")}:</span>{" "}
                    <strong>{profile.reading}</strong>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
