"""
Console Menu Interface for Chanakya Commons.

Demonstrates strict separation between the core engine (data structures & algorithms)
and interfaces: this CLI invokes the exact same NetworkEngine methods as the web API.
"""

from __future__ import annotations

import getpass
import os
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from backend.engine import EngineError, NetworkEngine
from backend.seed import seed_if_empty


def run_cli() -> None:
    engine = NetworkEngine()
    seed_if_empty(engine)
    current_user = None
    session_token = None

    print("\n=== Chanakya Commons — Console Client ===")
    while True:
        try:
            if not current_user:
                print(
                    "\n[1] Submit Registration Request   [2] Log in   [3] Check Registration Status   "
                    "[4] Search members (Trie)   [0] Exit"
                )
                choice = input("Select > ").strip()
                if choice == "0":
                    break
                if choice == "1":
                    role = input("Role (student/faculty): ").strip().lower() or "student"
                    university_id = input("Chanakya University ID (e.g. CU2026ENG010): ").strip()
                    username = input("Unique username: ").strip()
                    password = getpass.getpass("Password (min 6 chars): ")
                    name = input("Full name: ").strip()
                    school = input("School: ").strip()
                    programme = input("Programme: ").strip()
                    year = input("Year / Designation: ").strip()
                    bio = input("Short bio: ").strip()
                    skills = [s.strip() for s in input("Skills (optional, comma-separated): ").split(",") if s.strip()]
                    print("Please double-check your University ID — requests with a wrong ID will not be accepted.")
                    req = engine.submit_registration_request(
                        university_id, username, password, name, role, school, programme, year, bio, skills
                    )
                    print(req["message"])
                elif choice == "2":
                    identifier = input("Username or University ID: ").strip()
                    password = getpass.getpass("Password: ")
                    res = engine.login(identifier, password)
                    current_user = res["user"]["username"]
                    session_token = res["token"]
                    print(f"Logged in as {res['user']['name']} (@{current_user}) [{res['user']['role']}].")
                elif choice == "3":
                    ident = input("University ID or username: ").strip()
                    print(engine.check_registration_status(ident)["message"])
                elif choice == "4":
                    prefix = input("Prefix query: ").strip()
                    for item in engine.search_users(prefix):
                        print(f" - {item['name']} (@{item['username']}) · {item['role']} · {item['programme']}")
            else:
                print(
                    f"\nSigned in as @{current_user} | "
                    "[1] Home Feed (Heap)  [2] Create Post  [3] Connections & Requests  "
                    "[4] People You May Know  [5] Degree & Path (BFS)  [6] Prefix Search (Trie)  "
                    "[7] Profile Portfolio  [8] Spicy News (Latest News)  [9] Undo Stack  "
                    "[10] IT Admin Governance  [11] Log out  [0] Exit"
                )
                choice = input("Select > ").strip()
                if choice == "0":
                    break
                if choice == "1":
                    posts = engine.get_home_feed(current_user, limit=10)
                    if not posts:
                        print("Your feed is empty. Connect with peers or publish a project!")
                    for p in posts:
                        print(f"\n[{p['id']}] {p['title'] or 'Update'} — {p['author_name']} (@{p['author']})")
                        print(f"   {p['content']}")
                        print(f"   Likes: {p['like_count']} | Comments: {p['comment_count']}")
                elif choice == "2":
                    title = input("Project / Idea title: ").strip()
                    content = input("Content: ").strip()
                    tags = [t.strip() for t in input("Tags (comma-separated): ").split(",") if t.strip()]
                    post = engine.create_post(current_user, title, content, tags)
                    print(f"Published post {post['id']}.")
                elif choice == "3":
                    ov = engine.get_network_overview(current_user)
                    print(f"Connections ({len(ov['connections'])}):")
                    for c in ov["connections"]:
                        print(f" - {c['name']} (@{c['username']}) · {c['programme']}")
                    print(f"Incoming requests ({len(ov['incoming_requests'])}):")
                    for r in ov["incoming_requests"]:
                        print(f" * {r['user']['name']} (@{r['user']['username']}) [{r['mutual_count']} mutuals]")
                    sub = input("Action: [a] Accept  [r] Reject  [s] Send  [d] Remove  [Enter] Back > ").strip().lower()
                    if sub == "a":
                        u = input("Accept username: ").strip()
                        engine.accept_connection_request(current_user, u)
                        print("Accepted.")
                    elif sub == "r":
                        u = input("Reject username: ").strip()
                        engine.reject_connection_request(current_user, u)
                        print("Rejected.")
                    elif sub == "s":
                        u = input("Send request to username: ").strip()
                        engine.send_connection_request(current_user, u)
                        print("Sent.")
                    elif sub == "d":
                        u = input("Remove connection username: ").strip()
                        engine.remove_connection(current_user, u)
                        print("Removed.")
                elif choice == "4":
                    for s in engine.get_people_you_may_know(current_user):
                        u = s["user"]
                        print(
                            f" - {u['name']} (@{u['username']}) | Score: {s['score']} | "
                            f"Degree: {s['degree']} | Mutuals: {s['mutual_count']}"
                        )
                elif choice == "5":
                    target = input("Target username: ").strip()
                    res = engine.get_degree_and_path(current_user, target)
                    chain = " -> ".join(f"@{p['username']}" for p in res["shortest_path"])
                    print(f"Degree: {res['degree']} | Shortest Chain: {chain or 'No path'}")
                    print(f"Mutual connections: {len(res['mutual_connections'])}")
                elif choice == "6":
                    prefix = input("Prefix query: ").strip()
                    for item in engine.search_users(prefix, viewer=current_user):
                        print(f" - {item['name']} (@{item['username']}) · {item['programme']} · deg={item.get('degree')}")
                elif choice == "7":
                    items = engine.get_portfolio(current_user)
                    print(f"Your Profile Portfolio ({len(items)}):")
                    for it in items:
                        print(f" - [{it['category']}] {it['title']} ({it['issuer']}, {it['issue_date']})")
                    sub = input("Action: [a] Add certificate/achievement  [d] Delete  [Enter] Back > ").strip().lower()
                    if sub == "a":
                        cat = input("Category (certificate/achievement): ").strip().lower() or "certificate"
                        title = input("Title: ").strip()
                        issuer = input("Issuer / Organization: ").strip()
                        date = input("Date (e.g. October 2026): ").strip()
                        cid = input("Credential ID (optional): ").strip()
                        desc = input("Description (optional): ").strip()
                        created = engine.add_portfolio_item(current_user, cat, title, issuer, date, cid, "", desc)
                        print(f"Saved to portfolio: {created['id']}")
                    elif sub == "d":
                        pid = input("Portfolio item ID to remove: ").strip()
                        engine.delete_portfolio_item(current_user, pid)
                        print("Removed from portfolio.")
                elif choice == "8":
                    anns = engine.get_announcements()
                    print(f"\nSpicy News & University Latest News ({len(anns)}):")
                    for a in anns:
                        print(f" [{a['priority'].upper()}] {a['title']} ({a['category']}) — by {a['author_name']}")
                        print(f"   {a['content']}")
                elif choice == "9":
                    res = engine.undo_last_action(current_user)
                    print(res["message"])
                elif choice == "10":
                    ov = engine.admin_get_governance_overview(current_user)
                    print(f"\nNetwork Metrics: {ov['metrics']}")
                    for pr in ov.get("pending_registrations", []):
                        print(f" * Pending: {pr['name']} (ID: {pr['university_id']}, @{pr['username']}, {pr['role']})")
                    sub = input(
                        "Admin action: [a] Approve registration  [r] Reject registration  "
                        "[p] Publish Spicy News  [s] Suspend/Reinstate user  [Enter] Back > "
                    ).strip().lower()
                    if sub == "a":
                        uid = input("University ID or username to approve: ").strip()
                        print(engine.admin_approve_registration(current_user, uid)["message"])
                    elif sub == "r":
                        uid = input("University ID or username to reject: ").strip()
                        print(engine.admin_reject_registration(current_user, uid)["message"])
                    elif sub == "p":
                        title = input("Headline: ").strip()
                        priority = input("Priority (urgent/important/general): ").strip().lower() or "urgent"
                        category = input("Category (e.g. IT Alert, Academic): ").strip() or "University Notice"
                        content = input("Announcement message: ").strip()
                        ann = engine.publish_announcement(current_user, title, content, priority, category)
                        print(f"Published Spicy News {ann['id']}.")
                    elif sub == "s":
                        u = input("Target username: ").strip()
                        flag = input("Suspend? (y/n): ").strip().lower() == "y"
                        engine.admin_set_user_suspended(current_user, u, flag)
                        print("Updated member status.")
                elif choice == "11":
                    if session_token:
                        engine.logout(session_token)
                    current_user = None
                    session_token = None
        except EngineError as exc:
            print(f"Error: {exc.message}")
        except KeyboardInterrupt:
            break


if __name__ == "__main__":
    run_cli()
