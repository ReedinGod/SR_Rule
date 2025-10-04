import re
from datetime import datetime, timedelta
from collections import defaultdict

def extract_group_keywords(group_name):
    # 提取诸如 "# Apple"、"# Microsoft" 的组名关键字
    match = re.findall(r"(Apple|Microsoft|Google|Crypto|Media|Music|Cloud|Amazon|Netflix)", group_name, re.IGNORECASE)
    return [m.lower() for m in match]

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

def find_best_group(rule, group_keywords_map):
    # 只对HOST/HOST-SUFFIX/HOST-KEYWORD做智能匹配
    domain_part = rule.split(',')[-1].lower()
    for group_name, keywords in group_keywords_map.items():
        for kw in keywords:
            if kw in domain_part:
                return group_name
    return None  # 未找到合适分组

def simplify_rule(file_path, output_path, new_rules=[]):
    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # 分组保留
    groups = []  # [(group_name, [lines])]
    group_keywords_map = dict()  # group_name -> [keywords]
    current_group = []
    group_name = None

    # 分类统计
    type_counts = defaultdict(int)
    unique_lines = set()
    rule_lines_by_type = defaultdict(list)

    for line in lines:
        l = line.strip()
        if l.startswith("#"):
            if group_name:
                group_keywords_map[group_name] = extract_group_keywords(group_name)
                groups.append((group_name, current_group))
            current_group = []
            group_name = l
            continue
        if not l:
            continue
        if l not in unique_lines:
            unique_lines.add(l)
            rtype = get_rule_type(l)
            rule_lines_by_type[rtype].append(l)
            type_counts[rtype] += 1
            current_group.append(l)
    if current_group:
        group_keywords_map[group_name] = extract_group_keywords(group_name)
        groups.append((group_name, current_group))

    # 自动插入新规则归组
    for new_rule in new_rules:
        best_group = find_best_group(new_rule, group_keywords_map)
        if best_group:
            # 插入最优分组
            for idx, (gname, glist) in enumerate(groups):
                if gname == best_group and new_rule not in glist:
                    glist.append(new_rule)
                    type_counts[get_rule_type(new_rule)] += 1
                    unique_lines.add(new_rule)
                    break
        else:
            # 加到最后一个分组
            groups[-1][1].append(new_rule)
            type_counts[get_rule_type(new_rule)] += 1
            unique_lines.add(new_rule)

    total = sum(type_counts.values())
    now = datetime.utcnow()+ timedelta(hours=8)
    update_time = now.strftime('%Y-%m-%d %H:%M:%S UTC+8')

    # 输出
    with open(output_path, "w", encoding="utf-8") as out:
        out.write(f"# 简化后的规则，自动去重分组\n")
        out.write(f"# HOST: {type_counts['HOST']} | HOST-KEYWORD: {type_counts['HOST-KEYWORD']} | HOST-SUFFIX: {type_counts['HOST-SUFFIX']} | IP-CIDR: {type_counts['IP-CIDR']} | OTHER: {type_counts['OTHER']} | TOTAL: {total}\n")
        out.write(f"# Last Update: {update_time}\n\n")
        for gname, glist in groups:
            if gname:
                out.write(f"{gname}\n")
            sorted_group = sorted(set(glist), key=lambda x: (get_rule_type(x), x))
            for rule in sorted_group:
                out.write(f"{rule}\n")
            out.write("\n")

if __name__ == "__main__":
    # 新增规则可传入列表
    new_rule_lines = [
        "HOST-SUFFIX,bag.itunes.apple.com"
    ]
    simplify_rule("rules/Prodcust.list", "rules/Proxy.list", new_rules=new_rule_lines)
