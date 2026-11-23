#!/bin/bash
# One-time go-live for the password sign-in update. Run from a terminal on your Mac:
#   bash scripts/go-live.sh
# It asks before every step that deletes data. Safe to re-run.
set -u
cd "$(dirname "$0")/.." || exit 1
NODE_RUN="node --experimental-strip-types"

ask() { printf "\n%s [type yes to continue] " "$1"; read -r reply; [ "$reply" = "yes" ]; }
step() { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }

step "1. Push the code to GitHub (pushing main deploys the live site)"
git push -u origin homestead-updates || { echo "Push failed — fix the error above and re-run."; exit 1; }
git push origin main || { echo "Push of main failed — fix the error above and re-run."; exit 1; }

printf "\nYour live site address (e.g. https://homestead.vercel.app), or Enter to skip production: "
read -r SITE
SITE="${SITE%/}"

step "2. Local database: remove demo data and extra users"
if $NODE_RUN --env-file-if-exists=.env.local scripts/cleanup-demo.ts; then
  if ask "Delete everything listed above from the LOCAL database? This cannot be undone."; then
    $NODE_RUN --env-file-if-exists=.env.local scripts/cleanup-demo.ts --yes
    $NODE_RUN --env-file-if-exists=.env.local scripts/user-link.ts jaywillcreate@gmail.com
  else
    echo "Skipped the local database."
  fi
else
  echo "Could not reach the local database (is Postgres running?). Skipped."
fi

if [ -n "$SITE" ]; then
  step "3. Production database: remove demo data and extra users"
  PROD_ENV=".env.production.local"   # ignored by git; removed again below
  if npx --yes vercel env pull "$PROD_ENV" --environment=production --yes; then
    if APP_URL="$SITE" $NODE_RUN --env-file="$PROD_ENV" scripts/cleanup-demo.ts; then
      if ask "Delete everything listed above from the PRODUCTION database? This cannot be undone."; then
        APP_URL="$SITE" $NODE_RUN --env-file="$PROD_ENV" scripts/cleanup-demo.ts --yes
      else
        echo "Skipped the production cleanup."
      fi
      step "4. Your sign-in link for the live site"
      APP_URL="$SITE" $NODE_RUN --env-file="$PROD_ENV" scripts/user-link.ts jaywillcreate@gmail.com
      echo "Open that link once the Vercel deployment finishes, and choose your password."
    else
      echo "Could not reach the production database with the settings Vercel returned."
    fi
    rm -f "$PROD_ENV"
  else
    echo "Could not pull production settings from Vercel (run 'npx vercel login' and re-run)."
  fi
fi
printf "\nDone.\n"
