
import sys
import unittest
from pathlib import Path

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[1])
)

from app import app


class BookEaseHealthTest(unittest.TestCase):

    def test_health_endpoint_returns_200(self):
        with app.test_client() as client:
            response = client.get("/api/health")

        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()
