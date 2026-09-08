import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'select_account',
        },
      },
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;
          const user = await res.json();
          return user ?? null;
        } catch {
          return null;
        }
      },
    }),
  ],

  pages: {
    signIn: '/login',
  },

  session: {
    strategy: 'jwt',
  },

  callbacks: {
    // Runs immediately after sign-in, before jwt callback
    async signIn({ user, account }) {
      if (account?.provider === 'google' && user?.email) {
        try {
          // Upsert user into backend DB — creates row if it doesn't exist yet
          const res = await fetch(`${API_URL}/auth/upsert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              name: user.name ?? '',
              avatarUrl: user.image ?? '',
            }),
          });

          if (res.ok) {
            const dbUser = await res.json();
            // Attach DB id to the NextAuth user object so jwt callback can pick it up
            user.id = dbUser.id;
          }
        } catch (err) {
          console.error('[NextAuth] Failed to upsert user in backend:', err);
          // Don't block sign-in if backend is temporarily down
        }
      }
      return true;
    },

    async jwt({ token, user, account }) {
      // On initial sign-in, user object is populated
      if (user?.id) {
        token.dbUserId = user.id;
      }
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // Expose the backend DB user id to the frontend session
        (session.user as { id?: string }).id = token.dbUserId as string;
      }
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
});

export { handler as GET, handler as POST };
