export async function onRequestGet({request,env}) {
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  const room=(new URL(request.url).searchParams.get('room')||'default').slice(0,64);
  const id=env.KERAI_ROOMS.idFromName(room);
  return env.KERAI_ROOMS.get(id).fetch(request);
}
