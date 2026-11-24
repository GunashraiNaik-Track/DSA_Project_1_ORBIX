"""
Seed realistic Chanakya University students, faculty, IT Department Admin,
Outlook IDs, graph connections, project posts, profile portfolio credentials,
and initial Spicy News university announcements.
"""

from __future__ import annotations

import time
from backend.engine import NetworkEngine


def seed_if_empty(engine: NetworkEngine) -> None:
    if len(engine.users) > 0:
        _ensure_admin_and_announcements(engine)
        if (
            engine.users.contains("aarav.sharma")
            and len(engine.user_portfolio.get("aarav.sharma", [])) == 0
        ):
            _seed_default_portfolios(engine)
        if (
            engine.users.contains("aarav.sharma")
            and len(engine.communities_by_id) == 0
            and len(engine.community_proposals_by_id) == 0
        ):
            _seed_default_communities(engine)
        return

    now = time.time()

    members = [
        {
            "username": "aarav.sharma",
            "university_id": "CU2024ENG001",
            "role": "student",
            "password": "chanakya123",
            "name": "Aarav Sharma",
            "school": "School of Engineering",
            "programme": "B.Tech. in Computer Science & Artificial Intelligence",
            "year": "3rd Year",
            "bio": "Building embedded computer vision pipelines for autonomous campus rovers and low-latency Rust/Python systems.",
            "skills": ["Python", "ROS2", "PyTorch", "C++", "Embedded Vision"],
            "avatar_url": "/src/assets/images/avatar_student_male_1794842531165.jpg",
        },
        {
            "username": "ananya.iyer",
            "university_id": "CU2024ENG002",
            "role": "student",
            "password": "chanakya123",
            "name": "Ananya Iyer",
            "school": "School of Engineering",
            "programme": "B.Tech. in Electronics & Communication Engineering",
            "year": "3rd Year",
            "bio": "Researching biosignal processing, low-noise PCB front-ends, and interpretable ML for wearable EEG.",
            "skills": ["Signal Processing", "Python", "KiCad", "ESP32", "PyTorch"],
            "avatar_url": "/src/assets/images/avatar_student_female_1794842531205.jpg",
        },
        {
            "username": "rohan.kulkarni",
            "university_id": "CU2025MNS014",
            "role": "student",
            "password": "chanakya123",
            "name": "Rohan Kulkarni",
            "school": "School of Mathematics and Natural Sciences",
            "programme": "B.Sc. Hons. Data Science",
            "year": "2nd Year",
            "bio": "Working on campus microgrid telemetry, LoRaWAN sensor networks, and time-series forecasting.",
            "skills": ["IoT", "LoRaWAN", "Python", "Time Series", "SQLite"],
            "avatar_url": None,
        },
        {
            "username": "meera.nair",
            "university_id": "CU2024ENG019",
            "role": "student",
            "password": "chanakya123",
            "name": "Meera Nair",
            "school": "School of Engineering",
            "programme": "B.Tech. in Computer Science & Engineering",
            "year": "3rd Year",
            "bio": "Designing tactile hardware-software interfaces and accessible scientific visualization tools.",
            "skills": ["Interaction Design", "TypeScript", "React", "Figma", "WebGL"],
            "avatar_url": None,
        },
        {
            "username": "kabir.menon",
            "university_id": "CU2023ENG008",
            "role": "student",
            "password": "chanakya123",
            "name": "Kabir Menon",
            "school": "School of Engineering",
            "programme": "B.Tech. in Electrical Engineering & Computer Science",
            "year": "4th Year",
            "bio": "Distributed systems enthusiast exploring Raft consensus, CRDTs, and compiler IR optimizations.",
            "skills": ["Rust", "Distributed Systems", "C++", "Compilers", "Linux"],
            "avatar_url": None,
        },
        {
            "username": "diya.rao",
            "university_id": "CU2026BIO007",
            "role": "student",
            "password": "chanakya123",
            "name": "Diya Rao",
            "school": "School of Biosciences",
            "programme": "B.Tech. in Biotechnology & Bioengineering",
            "year": "1st Year",
            "bio": "Protein folding benchmarks and graph neural networks for molecular docking at Chanakya BioLab.",
            "skills": ["Graph Neural Networks", "Python", "Bioinformatics", "PyTorch"],
            "avatar_url": None,
        },
        {
            "username": "vikram.patel",
            "university_id": "CU2024MGT011",
            "role": "student",
            "password": "chanakya123",
            "name": "Vikram Patel",
            "school": "School of Management Sciences",
            "programme": "Bachelor of Business Administration (B.B.A. Honours)",
            "year": "3rd Year",
            "bio": "Coordinating Chanakya Venture Studio; helping student hardware teams ship field pilots across Karnataka.",
            "skills": ["Product Strategy", "Hardware Pilots", "Unit Economics", "IoT"],
            "avatar_url": None,
        },
        {
            "username": "sneha.deshmukh",
            "university_id": "CU2023MNS005",
            "role": "student",
            "password": "chanakya123",
            "name": "Sneha Deshmukh",
            "school": "School of Mathematics and Natural Sciences",
            "programme": "B.Sc. Hons. Data Science",
            "year": "4th Year",
            "bio": "Graph algorithms, causal inference for urban mobility, and civic open-data tooling.",
            "skills": ["Graph Theory", "Python", "Causal Inference", "TypeScript"],
            "avatar_url": None,
        },
        {
            "username": "aditya.verma",
            "university_id": "CU2025ENG022",
            "role": "student",
            "password": "chanakya123",
            "name": "Aditya Verma",
            "school": "School of Engineering",
            "programme": "B.Tech. in Robotics & Automation",
            "year": "2nd Year",
            "bio": "Flight controller tuning, PX4 simulation, and stereo SLAM on resource-constrained SBCs.",
            "skills": ["ROS2", "PX4", "C++", "SLAM", "Embedded Vision"],
            "avatar_url": None,
        },
        {
            "username": "prof.raghavendra",
            "university_id": "CUFACENG004",
            "role": "faculty",
            "password": "chanakya123",
            "name": "Dr. Raghavendra Bhat",
            "school": "School of Engineering",
            "programme": "B.Tech. in Robotics & Automation",
            "year": "Associate Professor",
            "bio": "Faculty lead for the Autonomous Systems & Campus Microgrid Lab. Mentoring student hardware and distributed systems research.",
            "skills": ["Embedded Systems", "Control Theory", "Robotics", "Signal Processing"],
            "avatar_url": None,
        },
    ]

    for s in members:
        engine.signup(
            username=s["username"],
            password=s["password"],
            name=s["name"],
            school=s["school"],
            programme=s["programme"],
            year=s["year"],
            bio=s["bio"],
            skills=s["skills"],
            avatar_url=s["avatar_url"],
            issue_session=False,
            university_id=s["university_id"],
            role=s["role"],
        )

    edges = [
        ("aarav.sharma", "ananya.iyer"),
        ("aarav.sharma", "aditya.verma"),
        ("aarav.sharma", "kabir.menon"),
        ("ananya.iyer", "diya.rao"),
        ("ananya.iyer", "meera.nair"),
        ("ananya.iyer", "prof.raghavendra"),
        ("aditya.verma", "kabir.menon"),
        ("rohan.kulkarni", "vikram.patel"),
        ("rohan.kulkarni", "sneha.deshmukh"),
        ("rohan.kulkarni", "prof.raghavendra"),
        ("vikram.patel", "prof.raghavendra"),
        ("sneha.deshmukh", "meera.nair"),
        ("kabir.menon", "sneha.deshmukh"),
    ]

    for u, v in edges:
        engine.graph.add_connection(u, v)
        engine.storage.save_connection(u, v, now - 86400)

    pending = [
        ("rohan.kulkarni", "aarav.sharma", now - 7200),
        ("diya.rao", "aarav.sharma", now - 3600),
        ("aarav.sharma", "meera.nair", now - 1800),
    ]
    for sender, receiver, ts in pending:
        engine.graph.add_pending_request(sender, receiver, ts)
        engine.storage.save_request(sender, receiver, ts)
        sender_obj = engine.users.get(sender)
        engine._push_notification(
            recipient=receiver,
            actor=sender,
            ntype="connection_request",
            message=f"{sender_obj.name if sender_obj else sender} sent you a connection request.",
            ref_id=sender,
        )

    seeded_posts = [
        {
            "author": "aarav.sharma",
            "title": "AUV-1 Quadcopter Stereo Depth Avoidance at 45 Hz",
            "content": (
                "Finished bench calibration for our carbon-fiber indoor rover/drone hybrid in the Chanakya Robotics Bay. "
                "Running an OAK-D stereo depth stream into a lightweight C++ voxel occupancy grid gives us 45 Hz obstacle "
                "avoidance under 18% CPU load on Jetson Orin Nano. Looking for someone experienced in Kalman sensor fusion "
                "to help tighten drift in low-texture corridors."
            ),
            "tags": ["ROS2", "StereoVision", "Robotics"],
            "image_url": "/src/assets/images/project_drone_vision_1794842531076.jpg",
            "age_sec": 1800,
        },
        {
            "author": "ananya.iyer",
            "title": "Open-Hardware 8-Channel EEG Front-End Rev 1.2 Bench Test",
            "content": (
                "Just probed the ADS1299 analog front-end on our custom 4-layer PCB! Common-mode rejection at 50 Hz "
                "improved by 14 dB after moving the driven-right-leg guard trace to an inner copper plane. Next step is "
                "streaming packets over ESP32-S3 Wi-Fi to a live Python bandpass + FFT visualizer for steady-state evoked "
                "potentials."
            ),
            "tags": ["BCI", "PCBDesign", "SignalProcessing"],
            "image_url": "/src/assets/images/project_bci_eeg_1794842530860.jpg",
            "age_sec": 5400,
        },
        {
            "author": "kabir.menon",
            "title": "Why We Switched Our Lab Task Queue from Locks to a Lock-Free Ring Buffer",
            "content": (
                "Benchmarked our campus compute scheduler under 10k concurrent telemetry writes. Replacing a coarse mutex "
                "around a Python/C++ work queue with a single-producer single-consumer ring buffer cut p99 tail latency from "
                "19.4 ms down to 1.8 ms. Happy to walk through the memory ordering trade-offs at Friday's systems reading group."
            ),
            "tags": ["Systems", "Concurrency", "C++"],
            "image_url": None,
            "age_sec": 11200,
        },
        {
            "author": "rohan.kulkarni",
            "title": "Solar Microgrid Node 03 — Live Campus Telemetry Pilot",
            "content": (
                "Deployed our third weatherproof LoRaWAN energy node beside the Innovation Hub rooftop array. Each node "
                "samples PV yield, inverter draw, and battery state-of-charge every 30 seconds and renders an on-device OLED "
                "load curve. Next week we are opening the dataset for anyone wanting to test anomaly detection models."
            ),
            "tags": ["Microgrid", "LoRaWAN", "Sustainability"],
            "image_url": "/src/assets/images/project_campus_solar_1794842531035.jpg",
            "age_sec": 16000,
        },
        {
            "author": "aditya.verma",
            "title": "PX4 Gazebo SITL Bridge for Multi-Agent Corridor Mapping",
            "content": (
                "Built a reproducible Dockerized PX4 + ROS2 Gazebo world matching the academic block atrium so teams can test "
                "formation flight before touching physical propellers. Ping me if your team wants the SDF mesh files."
            ),
            "tags": ["PX4", "Simulation", "ROS2"],
            "image_url": None,
            "age_sec": 24000,
        },
        {
            "author": "sneha.deshmukh",
            "title": "Measuring Homophily & Bridge Nodes in Campus Collaboration Graphs",
            "content": (
                "Ran Adamic-Adar and betweenness centrality on anonymized student club co-membership data. Cross-programme "
                "students (Design + CS, Policy + Data Science) account for 68% of shortest paths linking otherwise isolated "
                "departments!"
            ),
            "tags": ["GraphTheory", "NetworkScience", "Python"],
            "image_url": None,
            "age_sec": 32000,
        },
        {
            "author": "meera.nair",
            "title": "Typography & Contrast Rules for Dark-Lab Oscilloscope UIs",
            "content": (
                "Audited 6 student hardware dashboards this semester: switching numeric readouts to tabular monospace and "
                "replacing glowing neon borders with 1px hairline grids made dense sensor tables readable from across the lab bench."
            ),
            "tags": ["DesignSystems", "HCI", "HardwareUI"],
            "image_url": None,
            "age_sec": 41000,
        },
    ]

    created_post_ids: list[str] = []
    for sp in seeded_posts:
        res = engine.create_post(
            author=sp["author"],
            title=sp["title"],
            content=sp["content"],
            tags=sp["tags"],
            image_url=sp["image_url"],
        )
        pid = res["id"]
        post_obj = engine.posts_by_id.get(pid)
        if post_obj:
            post_obj.created_at = now - sp["age_sec"]
            with engine.storage._lock, engine.storage._connect() as conn:
                conn.execute(
                    "UPDATE posts SET created_at = ? WHERE id = ?",
                    (post_obj.created_at, pid),
                )
        created_post_ids.append(pid)

    for plist in engine.user_posts.values():
        plist.sort(key=lambda item: (-item.created_at, item.id))

    if len(created_post_ids) >= 3:
        p0, p1, p2 = created_post_ids[0], created_post_ids[1], created_post_ids[2]
        for liker in ("ananya.iyer", "kabir.menon", "aditya.verma"):
            engine.toggle_like(liker, p0)
        for liker in ("aarav.sharma", "meera.nair", "diya.rao"):
            engine.toggle_like(liker, p1)
        for liker in ("aarav.sharma", "sneha.deshmukh"):
            engine.toggle_like(liker, p2)

        updated_p0 = engine.add_comment(
            "aditya.verma",
            p0,
            "I have an EKF velocity-fusion node tuned for optical flow + IMU — can pair it with your OAK-D output tomorrow.",
        )
        first_comment_id = updated_p0["comments"][0]["id"]
        engine.add_comment(
            "aarav.sharma",
            p0,
            "That would be huge. Let's test it in the robotics bay after the 4 PM seminar.",
            parent_id=first_comment_id,
        )

        updated_p1 = engine.add_comment(
            "meera.nair",
            p1,
            "That 50 Hz notch improvement on the trace is super clean! Are you plotting raw µV or rolling RMS in the Python viewer?",
        )
        c1_id = updated_p1["comments"][0]["id"]
        engine.add_comment(
            "ananya.iyer",
            p1,
            "Raw µV with a 1–40 Hz Butterworth bandpass — would love your feedback on the channel color palette.",
            parent_id=c1_id,
        )

    _seed_default_portfolios(engine)
    _ensure_admin_and_announcements(engine)
    _seed_default_communities(engine)


def _ensure_admin_and_announcements(engine: NetworkEngine) -> None:
    if not engine.users.contains("chanakyauniversity2022"):
        engine.signup(
            username="chanakyauniversity2022",
            password="chanakya@2022university",
            name="IT Department Administration",
            school="Information Technology Services",
            programme="Campus Network Governance",
            year="Campus Administrator",
            bio="Official Chanakya University IT Governance & Network Supervision office. Publishes urgent campus advisories and manages network integrity.",
            skills=["Network Governance", "Campus Infrastructure", "Security"],
            avatar_url=None,
            issue_session=False,
            university_id="CU-IT-ADMIN-2022",
            role="admin",
        )

    # Remove deprecated demo admin account if present from earlier seed
    legacy_admin = engine.users.get("it.admin")
    if legacy_admin:
        for ann in engine.announcements:
            if ann.author == "it.admin":
                ann.author = "chanakyauniversity2022"
        engine.users.delete("it.admin")
        if legacy_admin.university_id:
            engine.users_by_email.delete(legacy_admin.university_id.lower())
        engine.trie.remove_user("it.admin", legacy_admin.name, legacy_admin.university_id)
        for tok, uname in list(engine.sessions.items()):
            if uname == "it.admin":
                engine.sessions.delete(tok)
        engine.storage.delete_user_account("it.admin", reassign_announcements_to="chanakyauniversity2022")

    if len(engine.announcements) == 0:
        engine.publish_announcement(
            admin_username="chanakyauniversity2022",
            title="Scheduled Campus Wi-Fi 6E & GPU Cluster Maintenance Tonight (11:30 PM – 1:00 AM)",
            content=(
                "The Chanakya University IT Department will upgrade core optical switches in the School of Engineering "
                "and Innovation Hub tonight between 11:30 PM and 1:00 AM IST. Save active Jupyter notebooks and checkpoint "
                "long-running training jobs before 11:15 PM."
            ),
            priority="urgent",
            category="IT Infrastructure",
        )
        engine.publish_announcement(
            admin_username="chanakyauniversity2022",
            title="Chanakya Annual Engineering & Research Symposium — Project Submission Window Open",
            content=(
                "Students and faculty mentors may upload project certificates, lab prototypes, and team abstracts through "
                "November 30. All registered Chanakya University ID accounts can showcase credentials in their Profile Portfolio."
            ),
            priority="important",
            category="University Notice",
        )


def _seed_default_portfolios(engine: NetworkEngine) -> None:
    items = [
        {
            "owner": "aarav.sharma",
            "category": "achievement",
            "title": "1st Place — Chanakya Autonomous Robotics Challenge",
            "issuer": "Chanakya University School of Engineering",
            "issue_date": "October 2026",
            "credential_id": "CU-ARC-2026-01",
            "credential_url": "",
            "description": "Awarded for real-time stereo depth obstacle avoidance running on Jetson Orin Nano at 45 Hz.",
        },
        {
            "owner": "aarav.sharma",
            "category": "certificate",
            "title": "Deep Learning & Computer Vision Specialization (Elite + Gold)",
            "issuer": "NPTEL / IIT Madras",
            "issue_date": "May 2026",
            "credential_id": "NPTEL26CS41S9921",
            "credential_url": "",
            "description": "Completed 12-week proctored coursework covering CNNs, stereo geometry, and PyTorch optimization.",
        },
        {
            "owner": "ananya.iyer",
            "category": "achievement",
            "title": "IEEE Student Hardware Prototype Grant Recipient",
            "issuer": "IEEE Bangalore Section",
            "issue_date": "September 2026",
            "credential_id": "IEEE-BLR-2026-14",
            "credential_url": "",
            "description": "Funded fabrication of the 4-layer open-hardware 8-channel ADS1299 EEG acquisition board.",
        },
        {
            "owner": "prof.raghavendra",
            "category": "achievement",
            "title": "Best Faculty Research Mentor Award",
            "issuer": "Chanakya University Academic Senate",
            "issue_date": "August 2026",
            "credential_id": "CU-SEN-2026-08",
            "credential_url": "",
            "description": "Recognized for supervising 6 interdisciplinary undergraduate robotics and microgrid prototypes.",
        },
    ]
    for it in items:
        if engine.users.contains(it["owner"]):
            engine.add_portfolio_item(
                owner=it["owner"],
                category=it["category"],
                title=it["title"],
                issuer=it["issuer"],
                issue_date=it["issue_date"],
                credential_id=it["credential_id"],
                credential_url=it["credential_url"],
                description=it["description"],
            )


def _seed_default_communities(engine: NetworkEngine) -> None:
    if not (
        engine.users.contains("aarav.sharma")
        and engine.users.contains("ananya.iyer")
        and engine.users.contains("chanakyauniversity2022")
    ):
        return

    # 1. Approved Community led by aarav.sharma
    p1 = engine.propose_community(
        proposer="aarav.sharma",
        name="Chanakya Robotics & Autonomous Systems Guild",
        category="School of Engineering",
        description="Student-led robotics collective building autonomous campus rovers, stereo vision rigs, and PX4 drone stacks.",
        charter="Weekly hardware build sprints in the Robotics Bay, ROS2/C++ workshops, and inter-university robotics challenge prep.",
        tags=["Robotics", "ROS2", "ComputerVision", "PX4"],
    )
    c1 = engine.admin_approve_community_proposal("chanakyauniversity2022", p1["proposal"]["id"])["community"]

    for extra_member, interest in [
        ("aditya.verma", "Tuning PX4 flight controllers and Gazebo multi-agent corridor simulation."),
        ("prof.raghavendra", "Faculty advisor for Autonomous Systems & Campus Microgrid Lab."),
    ]:
        if engine.users.contains(extra_member):
            engine.request_join_community(extra_member, c1["id"], interest)
            engine.review_community_join_request("aarav.sharma", c1["id"], extra_member, accept=True)

    if engine.users.contains("rohan.kulkarni"):
        engine.request_join_community(
            "rohan.kulkarni",
            c1["id"],
            "Building LoRaWAN telemetry nodes and want to collaborate on autonomous rover ground-station links.",
        )

    engine.post_community_message(
        "aarav.sharma",
        c1["id"],
        "Welcome to the Robotics Guild! This Friday 4 PM in Lab 204 we are benchmarking OAK-D depth fusion.",
    )
    engine.post_community_message(
        "chanakyauniversity2022",
        c1["id"],
        "IT Supervision Notice: Bench Wi-Fi VLAN & Jetson lab cluster access is active for all verified guild members.",
    )

    # 2. Approved Community led by ananya.iyer
    p2 = engine.propose_community(
        proposer="ananya.iyer",
        name="Biosignal & Embedded Hardware Lab",
        category="School of Biosciences",
        description="Open-hardware PCB design, wearable EEG/EMG acquisition, and interpretable biomedical signal ML.",
        charter="Hands-on KiCad schematic reviews, analog front-end testing, and collaborative bio-AI benchmarks.",
        tags=["Embedded", "PCB", "SignalProcessing", "BioAI"],
    )
    c2 = engine.admin_approve_community_proposal("chanakyauniversity2022", p2["proposal"]["id"])["community"]

    for extra_member, interest in [
        ("meera.nair", "Designing clean real-time waveform dashboards and hardware UI guidelines."),
        ("diya.rao", "Exploring graph neural networks and physiological signal classification."),
    ]:
        if engine.users.contains(extra_member):
            engine.request_join_community(extra_member, c2["id"], interest)
            engine.review_community_join_request("ananya.iyer", c2["id"], extra_member, accept=True)

    # 3. Pending Community Proposal awaiting IT Admin Assessment
    if engine.users.contains("sneha.deshmukh"):
        engine.propose_community(
            proposer="sneha.deshmukh",
            name="Campus Graph & Civic Data Collective",
            category="School of Mathematics and Natural Sciences",
            description="Open student research circle studying urban mobility networks, causal inference, and campus civic datasets.",
            charter="Bi-weekly reading group on network science, graph algorithms, and reproducible public-interest notebooks.",
            tags=["GraphTheory", "DataScience", "CausalInference"],
        )

