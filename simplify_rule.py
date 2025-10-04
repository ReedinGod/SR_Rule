import re
from datetime import datetime
from collections import defaultdict

def get_rule_type(line):
    if line.startswith("HOST,"):
        return "HOST"
    elif line.startswith("HOST-KEYWORD,"):
        return "HOST-KEYWORD"
    elif line.startswith("HOST-SUFFIX,"):
        return "HOST-SUFFIX"
    elif line.startswith("IP-CIDR,"):
        return "IP-CIDR"
    else:
        return "OTHER"

def simplify_rule(file_path, output_path):
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # 分组保留（按注释）
    groups = []  # [(group_name, [lines])]
    current_group = []
    group_name = None

    # 分类统计
    type_counts = defaultdict(int)
    unique_lines = set()
    rule_lines_by_type = defaultdict(list)

    for line in lines:
        l = line.strip()
        # 保留注释分组
        if l.startswith("#"):
            if current_group:
                groups.append((group_name, current_group))
                current_group = []
            group_name = l
            continue
        if not l:
            continue
        rtype = get_rule_type(l)
        if l not in unique_lines:
            unique_lines.add(l)
            rule_lines_by_type[rtype].append(l)
            type_counts[rtype] += 1
            current_group.append(l)

    if current_group:
        groups.append((group_name, current_group))

    total = sum(type_counts.values())
    now = datetime.utcnow()
    update_time = now.strftime('%Y-%m-%d %H:%M:%S UTC')

    # 写文件，置顶加统计
    with open(output_path, "w", encoding="utf-8") as out:
        out.write(f"# 简化后的规则，自动去重分组\n")
        out.write(f"# HOST: {type_counts['HOST']} | HOST-KEYWORD: {type_counts['HOST-KEYWORD']} | HOST-SUFFIX: {type_counts['HOST-SUFFIX']} | IP-CIDR: {type_counts['IP-CIDR']} | OTHER: {type_counts['OTHER']} | TOTAL: {total}\n")
        out.write(f"# Last Update: {update_time}\n\n")

        # 保留原分类和注释，但同类规则自动聚集在一起
        for group_name, group_rules in groups:
            if group_name:
                out.write(f"{group_name}\n")
            # 按规则类型和相近域名分组、排序
            sorted_group = sorted(group_rules, key=lambda x: (get_rule_type(x), x))
            for rule in sorted_group:
                out.write(f"{rule}\n")
            out.write("\n")

if __name__ == "__main__":
    simplify_rule("rules/Prodcust.list", "rules/Proxy.list")
