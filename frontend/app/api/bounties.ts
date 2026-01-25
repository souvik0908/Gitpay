'use client' // Add this line to mark the component as a client component

import { useEffect, useState } from "react";
import axios from "axios";

const ActiveBounties = () => {
  const [bounties, setBounties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get("http://localhost:8787/bounties")
      .then(response => {
        setBounties(response.data);
        setLoading(false);
      })
      .catch(error => {
        console.error("Error fetching bounties:", error);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div>Loading... </div>;
  }

  return (
    <div>
      {bounties.map((bounty) => (
        <div key={bounty.issueNumber}>
          <p>Issue #{bounty.issueNumber} in {bounty.repo}</p>
          <p>Transaction Hash: {bounty.fundedTxHash}</p>
        </div>
      ))}
    </div>
  );
};

export default ActiveBounties;
