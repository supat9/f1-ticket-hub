import { redirect } from "next/navigation";

export function GET(request: Request) {
	redirect(`/${new URL(request.url).search}`);
}

// Existing preview tabs still post language changes to this address.
export { POST } from "../route";
