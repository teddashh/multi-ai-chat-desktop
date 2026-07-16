const SAFE_WINDOWS_COMMAND_TOKEN = /^[A-Za-z0-9._:/\\=@+-]+$/u;

export function windowsShellCommand(command, args = []) {
  const tokens = [command, ...args];
  if (!tokens.every((token) => typeof token === 'string' && token.length > 0 && SAFE_WINDOWS_COMMAND_TOKEN.test(token))) {
    return undefined;
  }
  return tokens.join(' ');
}
