export const authConfig = {
  databaseURL: 'postgres://fixture:fixture@127.0.0.1:9/fixture',
  baseURL: 'http://127.0.0.1:3212',
  secret: process.env.BETTER_AUTH_SECRET,
}
