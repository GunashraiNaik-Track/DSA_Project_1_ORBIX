"""Automated verification tests for Chanakya Commons Python core engine."""

from __future__ import annotations

import os
import tempfile
import unittest

from backend.data_structures import HashTable, Trie
from backend.engine import EngineError, NetworkEngine
from backend.seed import seed_if_empty
from backend.storage import SQLiteStorage


class TestCoreEngine(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.tmpdir.name, "test.db")
        self.storage = SQLiteStorage(self.db_path)
        self.engine = NetworkEngine(self.storage)

    def tearDown(self) -> None:
        self.tmpdir.cleanup()

    def test_hash_table_and_trie(self) -> None:
        ht = HashTable[str, int](initial_capacity=8)
        for i in range(40):
            ht.put(f"key_{i}", i)
        self.assertEqual(len(ht), 40)
        self.assertEqual(ht.get("key_25"), 25)
        self.assertTrue(ht.delete("key_25"))
        self.assertIsNone(ht.get("key_25"))

        trie = Trie()
        trie.insert_user("aarav.sharma", "Aarav Sharma")
        trie.insert_user("ananya.iyer", "Ananya Iyer")
        trie.insert_user("aditya.verma", "Aditya Verma")
        self.assertEqual(trie.search_prefix("aa"), ["aarav.sharma"])
        self.assertEqual(trie.search_prefix("iyer"), ["ananya.iyer"])
        self.assertEqual(set(trie.search_prefix("a")), {"aarav.sharma", "aditya.verma", "ananya.iyer"})

    def test_admin_verified_registration_and_portfolio_persistence(self) -> None:
        seed_if_empty(self.engine)

        # Missing mandatory bio or school or programme should fail
        with self.assertRaises(EngineError):
            self.engine.submit_registration_request(
                university_id="CU2026FAC01",
                username="priya.k",
                password="securepassword",
                name="Priya Kapoor",
                role="faculty",
                school="School of Engineering",
                programme="B.Tech. in Computer Science & Engineering",
                year="Assistant Professor",
                bio="",
            )

        # Submit registration request with wrong ID initially (skills optional)
        submitted = self.engine.submit_registration_request(
            university_id="CU2026WRONG",
            username="priya.k",
            password="securepassword",
            name="Priya Kapoor",
            role="faculty",
            school="School of Engineering",
            programme="B.Tech. in Computer Science & Engineering",
            year="Assistant Professor",
            bio="Teaching Algorithms & AI.",
            skills=[],
        )
        self.assertTrue(submitted["submitted"])
        self.assertEqual(
            submitted["message"],
            "Your request has been sent and will be verified by the university admin.",
        )

        # University ID and username are reserved while pending
        with self.assertRaises(EngineError):
            self.engine.submit_registration_request(
                university_id="CU2026FAC01",
                username="priya.k",
                password="securepassword",
                name="Priya Kapoor",
                role="faculty",
                school="School of Engineering",
                programme="B.Tech. in Computer Science & Engineering",
                year="Assistant Professor",
                bio="Duplicate username check.",
            )

        # Pending user cannot log in before admin approval (returns pending_approval code)
        with self.assertRaises(EngineError) as ctx:
            self.engine.login("CU2026WRONG", "securepassword")
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.code, "pending_approval")
        self.assertIn("verified by the university admin", ctx.exception.message)

        # Status check returns pending and pending user is NOT in active Trie search
        self.assertEqual(self.engine.check_registration_status("priya.k")["status"], "pending")
        self.assertFalse(any(u["username"] == "priya.k" for u in self.engine.search_users("priya")))

        # Admin rejects wrong ID request -> deletes request & frees username/ID
        self.engine.admin_reject_registration("chanakyauniversity2022", "CU2026WRONG")
        self.assertEqual(self.engine.check_registration_status("CU2026WRONG")["status"], "not_found")

        # User re-applies with corrected University ID
        self.engine.submit_registration_request(
            university_id="CU2026FAC01",
            username="priya.k",
            password="securepassword",
            name="Priya Kapoor",
            role="faculty",
            school="School of Engineering",
            programme="B.Tech. in Computer Science & Engineering",
            year="Assistant Professor",
            bio="Teaching Algorithms & AI.",
            skills=[],
        )

        # Pending registration survives simulated server restart before approval
        restarted_before = NetworkEngine(SQLiteStorage(self.db_path))
        self.assertEqual(restarted_before.check_registration_status("CU2026FAC01")["status"], "pending")

        # IT Admin inspects queue and approves registration
        overview = restarted_before.admin_get_governance_overview("chanakyauniversity2022")
        self.assertEqual(overview["metrics"]["pending_registrations"], 1)
        self.assertEqual(overview["pending_registrations"][0]["university_id"], "CU2026FAC01")

        approved = restarted_before.admin_approve_registration("chanakyauniversity2022", "CU2026FAC01")
        self.assertTrue(approved["approved"])
        self.assertEqual(approved["user"]["role"], "faculty")
        self.assertEqual(approved["user"]["school"], "School of Engineering")

        # Approved user is immediately searchable by name, username, and University ID
        self.assertEqual(restarted_before.search_users("CU2026FAC01")[0]["username"], "priya.k")
        self.assertEqual(restarted_before.check_registration_status("CU2026FAC01")["status"], "approved")

        login_res = restarted_before.login("CU2026FAC01", "securepassword")
        token = login_res["token"]
        self.assertEqual(restarted_before.authenticate_token(token), "priya.k")

        cert = restarted_before.add_portfolio_item(
            owner="priya.k",
            category="certificate",
            title="ACM SIGCSE Excellence Recognition",
            issuer="ACM",
            issue_date="October 2026",
            credential_id="ACM-2026-44",
            description="Faculty workshop award.",
        )
        # Campus feed is open to all logged-in users; connections-only filter has 0; portfolio is separate
        self.assertGreater(len(restarted_before.get_home_feed("priya.k")), 0)
        self.assertEqual(len(restarted_before.get_home_feed("priya.k", scope="connections")), 0)
        self.assertEqual(len(restarted_before.get_portfolio("priya.k")), 1)

        restarted_before.delete_portfolio_item("priya.k", cert["id"])
        self.assertEqual(len(restarted_before.get_portfolio("priya.k")), 0)
        restarted_before.undo_last_action("priya.k")
        self.assertEqual(len(restarted_before.get_portfolio("priya.k")), 1)

        restarted_after = NetworkEngine(SQLiteStorage(self.db_path))
        self.assertEqual(restarted_after.authenticate_token(token), "priya.k")
        restarted_portfolio = restarted_after.get_portfolio("priya.k")
        self.assertEqual(len(restarted_portfolio), 1)
        self.assertEqual(restarted_portfolio[0]["title"], "ACM SIGCSE Excellence Recognition")

    def test_admin_governance_and_spicy_news(self) -> None:
        seed_if_empty(self.engine)

        # Non-admin cannot publish Spicy News or inspect governance
        with self.assertRaises(EngineError):
            self.engine.publish_announcement(
                "aarav.sharma", "Unauthorized", "Should fail", "urgent"
            )
        with self.assertRaises(EngineError):
            self.engine.admin_get_governance_overview("aarav.sharma")

        # Legacy it.admin must not be usable
        with self.assertRaises(EngineError):
            self.engine.login("it.admin", "chanakyaadmin123")

        # IT Admin login with configured credentials & Spicy News urgent broadcast
        admin_login = self.engine.login("chanakyauniversity2022", "chanakya@2022university")
        self.assertEqual(admin_login["user"]["role"], "admin")

        ann = self.engine.publish_announcement(
            admin_username="chanakyauniversity2022",
            title="Urgent Campus Server Upgrade",
            content="Please save all lab datasets before 8 PM.",
            priority="urgent",
            category="IT Infrastructure",
        )
        self.assertEqual(ann["priority"], "urgent")

        # Verify students received Spicy News notification
        notifs = self.engine.get_notifications("aarav.sharma")["items"]
        self.assertTrue(any(n["ntype"] == "spicy_news" and "Urgent Campus Server Upgrade" in n["message"] for n in notifs))

        # Admin suspends & reinstates a member
        self.engine.admin_set_user_suspended("chanakyauniversity2022", "aditya.verma", True)
        with self.assertRaises(EngineError):
            self.engine.login("aditya.verma", "chanakya123")
        self.engine.admin_set_user_suspended("chanakyauniversity2022", "aditya.verma", False)
        self.engine.login("aditya.verma", "chanakya123")

        # Persisted announcements survive restart
        restarted = NetworkEngine(SQLiteStorage(self.db_path))
        self.assertTrue(any(a["id"] == ann["id"] for a in restarted.get_announcements()))

    def test_bfs_degrees_paths_feed_and_undo(self) -> None:
        seed_if_empty(self.engine)
        d1 = self.engine.get_degree_and_path("aarav.sharma", "ananya.iyer")
        self.assertEqual(d1["degree"], 1)
        d2 = self.engine.get_degree_and_path("aarav.sharma", "meera.nair")
        self.assertEqual(d2["degree"], 2)
        d3 = self.engine.get_degree_and_path("aarav.sharma", "rohan.kulkarni")
        self.assertEqual(d3["degree"], 3)

        feed = self.engine.get_home_feed("aarav.sharma", include_self=True)
        timestamps = [p["created_at"] for p in feed]
        self.assertEqual(timestamps, sorted(timestamps, reverse=True))

        own_posts = self.engine.get_user_posts("aarav.sharma", viewer="aarav.sharma")
        pid = own_posts[0]["id"]
        self.engine.delete_post("aarav.sharma", pid)
        self.assertEqual(len(self.engine.get_user_posts("aarav.sharma")), 0)
        self.engine.undo_last_action("aarav.sharma")
        self.assertEqual(len(self.engine.get_user_posts("aarav.sharma")), 1)

    def test_common_feed_and_managed_communities_workflow(self) -> None:
        seed_if_empty(self.engine)

        # New isolated member with zero connections still sees all campus posts in common feed
        self.engine.signup(
            username="newbie.cu",
            password="password123",
            name="Newbie Student",
            university_id="CU2026NEW01",
            issue_session=False,
        )
        common_feed = self.engine.get_home_feed("newbie.cu", scope="campus")
        self.assertGreaterEqual(len(common_feed), 7)
        self.assertEqual(len(self.engine.get_home_feed("newbie.cu", scope="connections")), 0)
        self.assertGreater(len(self.engine.get_trending_posts("newbie.cu", scope="campus")), 0)

        # Student proposes a new community -> enters IT Admin FIFO queue
        prop_res = self.engine.propose_community(
            proposer="newbie.cu",
            name="Quantum Computing Study Circle",
            category="School of Mathematics and Natural Sciences",
            description="Exploring Qiskit, quantum error correction, and linear algebra.",
            charter="Weekly paper readings and Qiskit circuit labs.",
            tags=["Quantum", "Python"],
        )
        prop_id = prop_res["proposal"]["id"]
        self.assertIn("IT Admin", prop_res["message"])

        # Duplicate proposal name rejected via HashTable O(1) check
        with self.assertRaises(EngineError):
            self.engine.propose_community(
                proposer="aarav.sharma",
                name="quantum computing study circle",
                category="School of Engineering",
                description="Duplicate check.",
            )

        # IT Admin inspects governance overview and approves proposal -> proposer becomes Leader
        ov = self.engine.admin_get_governance_overview("chanakyauniversity2022")
        self.assertTrue(any(p["id"] == prop_id for p in ov["community_proposals"]))
        approved = self.engine.admin_approve_community_proposal("chanakyauniversity2022", prop_id)
        comm = approved["community"]
        comm_id = comm["id"]
        self.assertEqual(comm["leader"], "newbie.cu")
        self.assertIn("newbie.cu", comm["member_usernames"])

        # Another student requests to join with stated interest -> goes to Leader's FIFO queue
        with self.assertRaises(EngineError):
            self.engine.request_join_community("vikram.patel", comm_id, "hi")  # too short

        join_res = self.engine.request_join_community(
            "vikram.patel",
            comm_id,
            "Interested in quantum optimization algorithms for logistics.",
        )
        self.assertEqual(join_res["status"], "pending")

        leader_notifs = self.engine.get_notifications("newbie.cu")["items"]
        self.assertTrue(
            any(
                n["ntype"] == "community_join_request"
                and "quantum optimization" in n["message"].lower()
                for n in leader_notifs
            )
        )

        # Non-leader student cannot approve join request
        with self.assertRaises(EngineError):
            self.engine.review_community_join_request("aarav.sharma", comm_id, "vikram.patel", accept=True)

        # Leader sees join request with interest and approves it
        leader_view = self.engine.get_communities_overview(viewer="newbie.cu")["managed_communities"]
        target_comm = next(c for c in leader_view if c["id"] == comm_id)
        self.assertEqual(len(target_comm["pending_join_requests"]), 1)
        self.assertIn("logistics", target_comm["pending_join_requests"][0]["interest"])

        self.engine.review_community_join_request("newbie.cu", comm_id, "vikram.patel", accept=True)
        self.assertTrue(self.engine.community_graph.is_member(comm_id, "vikram.patel"))

        # Non-matching school student can still request to join an open community by default!
        # Let's test open-by-default cross-school join: newbie.cu (School of Engineering default)
        # is in School of Engineering while Quantum Computing Study Circle is School of Mathematics and Natural Sciences.
        # Add another student from School of Management Sciences and verify open join vs restricted join.
        self.engine.signup(
            username="mgmt.student",
            password="password123",
            name="Mgmt Student",
            university_id="CU2026MGM01",
            school="School of Management Sciences",
            programme="B. Com. Honours",
            issue_session=False,
        )
        mgmt_open_view = self.engine.get_communities_overview(viewer="mgmt.student")["managed_communities"]
        mgmt_target = next(c for c in mgmt_open_view if c["id"] == comm_id)
        self.assertTrue(mgmt_target["can_request_join"])
        self.assertFalse(mgmt_target["school_restricted"])

        # Host (leader) restricts the community to School of Mathematics and Natural Sciences only
        self.engine.set_community_access_policy(
            "newbie.cu",
            comm_id,
            school_restricted=True,
            allowed_school="School of Mathematics and Natural Sciences",
        )
        mgmt_restricted_view = self.engine.get_communities_overview(viewer="mgmt.student")["managed_communities"]
        mgmt_target_restricted = next(c for c in mgmt_restricted_view if c["id"] == comm_id)
        self.assertFalse(mgmt_target_restricted["can_request_join"])
        self.assertIn("School of Mathematics and Natural Sciences", mgmt_target_restricted["join_restriction_reason"])

        with self.assertRaises(EngineError) as restrict_ctx:
            self.engine.request_join_community(
                "mgmt.student",
                comm_id,
                "Interested in quantitative finance applications.",
            )
        self.assertEqual(restrict_ctx.exception.status_code, 403)

        # Student from the allowed School CAN join
        self.engine.signup(
            username="math.student",
            password="password123",
            name="Math Student",
            university_id="CU2026MNS01",
            school="School of Mathematics and Natural Sciences",
            programme="B.Sc. Hons. Mathematics",
            issue_session=False,
        )
        math_join = self.engine.request_join_community(
            "math.student",
            comm_id,
            "Studying linear algebra and quantum gates.",
        )
        self.assertEqual(math_join["status"], "pending")

        # IT Admin reopens the community to all schools, allowing mgmt.student to join
        self.engine.set_community_access_policy(
            "chanakyauniversity2022",
            comm_id,
            school_restricted=False,
        )
        mgmt_reopened = self.engine.request_join_community(
            "mgmt.student",
            comm_id,
            "Excited to join now that all schools are welcome.",
        )
        self.assertEqual(mgmt_reopened["status"], "pending")

        # IT Admin sends supervision notice and suspends/reactivates community
        self.engine.post_community_message(
            "chanakyauniversity2022",
            comm_id,
            "IT Supervision: Please submit semester lab room booking schedule.",
        )
        self.engine.admin_set_community_suspended("chanakyauniversity2022", comm_id, True)
        with self.assertRaises(EngineError):
            self.engine.request_join_community("diya.rao", comm_id, "Want to learn Qiskit!")
        self.engine.admin_set_community_suspended("chanakyauniversity2022", comm_id, False)

        # Restart persistence check
        restarted = NetworkEngine(SQLiteStorage(self.db_path))
        self.assertTrue(restarted.community_graph.is_member(comm_id, "vikram.patel"))
        restarted_view = restarted.get_communities_overview(viewer="vikram.patel")["managed_communities"]
        restarted_comm = next(c for c in restarted_view if c["id"] == comm_id)
        self.assertEqual(restarted_comm["my_status"], "member")
        self.assertFalse(restarted_comm["school_restricted"])
        self.assertIn("School of Engineering", restarted.get_communities_overview()["school_categories"])
        self.assertTrue(any(m["is_admin_notice"] for m in restarted_comm["messages"]))

    def test_password_reset_request_and_admin_approval(self):
        seed_if_empty(self.engine)

        # Issue an active session for a student before password reset
        login_res = self.engine.login("aarav.sharma", "chanakya123")
        old_token = login_res["token"]
        self.assertEqual(self.engine.authenticate_token(old_token), "aarav.sharma")

        # IT Admin account cannot use self-service password reset
        with self.assertRaises(EngineError) as admin_ctx:
            self.engine.submit_password_reset_request("chanakyauniversity2022", "newpass999")
        self.assertEqual(admin_ctx.exception.status_code, 403)

        # Student submits password change request using their University ID
        submitted = self.engine.submit_password_reset_request(
            "CU2024ENG001",
            "newsecurepass2026",
            reason="Forgot my old password; please verify with Engineering department.",
        )
        self.assertTrue(submitted["submitted"])
        self.assertEqual(submitted["status"], "pending")
        self.assertEqual(submitted["username"], "aarav.sharma")
        req_id = submitted["request_id"]

        # Duplicate pending request is rejected
        with self.assertRaises(EngineError) as dup_ctx:
            self.engine.submit_password_reset_request("aarav.sharma", "anotherpass2026")
        self.assertEqual(dup_ctx.exception.status_code, 409)

        # Status check returns pending before admin decision
        pending_status = self.engine.check_password_reset_status("aarav.sharma")
        self.assertEqual(pending_status["status"], "pending")
        self.assertEqual(pending_status["request_id"], req_id)

        # IT Admin sees request in governance overview and accepts it
        overview = self.engine.admin_get_governance_overview("chanakyauniversity2022")
        self.assertTrue(any(r["id"] == req_id for r in overview["password_reset_requests"]))

        approved = self.engine.admin_approve_password_reset("chanakyauniversity2022", req_id)
        self.assertTrue(approved["approved"])

        # Old session is invalidated and old password fails; new password works
        self.assertIsNone(self.engine.authenticate_token(old_token))
        with self.assertRaises(EngineError):
            self.engine.login("aarav.sharma", "chanakya123")
        new_login = self.engine.login("aarav.sharma", "newsecurepass2026")
        self.assertEqual(new_login["user"]["username"], "aarav.sharma")

        # Status check reports approved
        approved_status = self.engine.check_password_reset_status("CU2024ENG001")
        self.assertEqual(approved_status["status"], "approved")

        # Faculty request rejected by IT Admin keeps existing password unchanged
        fac_req = self.engine.submit_password_reset_request(
            "prof.raghavendra",
            "rejectedpass123",
            reason="Testing rejection path",
        )
        rejected = self.engine.admin_reject_password_reset("chanakyauniversity2022", fac_req["request_id"])
        self.assertTrue(rejected["rejected"])
        self.assertEqual(
            self.engine.check_password_reset_status("prof.raghavendra")["status"],
            "rejected",
        )
        with self.assertRaises(EngineError):
            self.engine.login("prof.raghavendra", "rejectedpass123")
        self.assertEqual(self.engine.login("prof.raghavendra", "chanakya123")["user"]["username"], "prof.raghavendra")

        # Restart persistence check: updated password & cleared old session survive restart
        restarted = NetworkEngine(SQLiteStorage(self.db_path))
        self.assertIsNone(restarted.authenticate_token(old_token))
        self.assertEqual(restarted.login("aarav.sharma", "newsecurepass2026")["user"]["username"], "aarav.sharma")
        self.assertEqual(restarted.check_password_reset_status("prof.raghavendra")["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
