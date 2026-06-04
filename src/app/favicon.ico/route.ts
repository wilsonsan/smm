import { NextResponse } from "next/server";

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/social-media-favicon.svg", request.url), 307);
}
